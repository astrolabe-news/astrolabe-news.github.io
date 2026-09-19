// Every story gets an extractive summary immediately, so nothing is ever blank. Where a
// Gemini key is configured, a budgeted number of the biggest stories get upgraded to
// written prose - one call returning the general summary and the per-side Bias
// Comparison together, so the comparison is free rather than four times the cost.
import { readFileSync, existsSync } from 'node:fs';
import { sentences, tokens } from '../lib/text.mjs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;

export async function summarizeAll(stories, { cachePath, disabled = false, budget = 200, log = console.log } = {}) {
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const key = process.env.GEMINI_API_KEY;

  // Extractive first, always. Cheap, instant, and the floor everything else builds on.
  for (const s of stories) {
    const cached = cache[s.id];
    if (cached?.source === 'gemini') {
      s.summary = cached.general;
      s.comparison = cached.comparison ?? null;
      s.summarySource = 'gemini';
    } else {
      s.summary = extractive(s);
      s.summarySource = 'extractive';
    }
  }

  if (disabled || !key) {
    log(`  extractive only${disabled ? ' (--no-llm)' : ' (no GEMINI_API_KEY set)'}`);
    return cache;
  }

  // Spend the budget where the most people will see it.
  const queue = stories
    .filter((s) => cache[s.id]?.source !== 'gemini' && s.coverage.total >= 3)
    .sort((a, b) => b.coverage.total - a.coverage.total)
    .slice(0, budget);

  log(`  ${queue.length} stories queued for Gemini (budget ${budget})`);
  let ok = 0;
  let spent = 0;

  for (const s of queue) {
    try {
      const result = await callGemini(key, s);
      if (!result) continue;
      cache[s.id] = { ...result, source: 'gemini', at: Date.now() };
      s.summary = result.general;
      s.comparison = result.comparison ?? null;
      s.summarySource = 'gemini';
      ok++;
    } catch (err) {
      const msg = String(err.message || err);
      // 429 means the daily free-tier allowance is gone. Stop, keep what we have.
      if (/\b429\b|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
        log(`  quota reached after ${ok} summaries; the rest stay extractive`);
        break;
      }
      log(`  summary failed for "${s.title.slice(0, 40)}": ${msg.slice(0, 80)}`);
    }
    spent++;
    if (spent % 10 === 0) log(`  summarized ${spent}/${queue.length}`);
    await sleep(6500); // free tier is rate-limited per minute, not just per day
  }

  log(`  ${ok} Gemini summaries written`);
  return cache;
}

// Bias Comparison only makes sense where the sides actually differ enough to compare.
const comparable = (s) =>
  s.coverage.total >= 15 &&
  ['left', 'center', 'right'].filter((k) => s.coverage.sides[k] >= 2).length >= 2;

async function callGemini(key, story) {
  const wantComparison = comparable(story);
  const res = await fetch(`${ENDPOINT(MODEL)}?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(story, wantComparison) }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) return null;

  const parsed = JSON.parse(text);
  const general = clean(parsed.summary);
  if (!general.length) return null;

  const comparison = wantComparison && parsed.comparison
    ? {
        left: String(parsed.comparison.left || '').trim() || null,
        center: String(parsed.comparison.center || '').trim() || null,
        right: String(parsed.comparison.right || '').trim() || null
      }
    : null;

  return { general, comparison };
}

const clean = (v) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x).replace(/^[-•*]\s*/, '').trim())
    .filter((x) => x.length > 20)
    .slice(0, 6);

function prompt(story, wantComparison) {
  const byside = { left: [], center: [], right: [] };
  for (const a of story.articles.slice(0, 40)) {
    if (a.side) byside[a.side].push(`${a.source}: ${a.title}${a.dek ? ` — ${a.dek.slice(0, 200)}` : ''}`);
  }
  const block = (k) => (byside[k].length ? `\n${k.toUpperCase()}-LEANING OUTLETS:\n${byside[k].slice(0, 12).join('\n')}` : '');

  return `You are a wire editor. Below are headlines and summaries from ${story.coverage.total} news outlets covering one story.

Write a factual summary as 4 to 6 bullets. Rules:
- Report only what the sources state. No speculation, no framing, no commentary.
- Plain declarative sentences, like a wire service. Lead with who did what.
- No throat-clearing openers ("In a significant development", "Amid growing concerns").
- No em dashes. No rhetorical questions. No closing takeaway line.
- Include concrete specifics: names, numbers, dates, places.
${wantComparison ? `
Also write a "comparison" object with one sentence for each of left, center and right,
describing what that side's coverage emphasises differently. If a side's coverage is not
meaningfully different, say so plainly. Do not invent differences.` : ''}

Return JSON: {"summary": ["bullet", ...]${wantComparison ? ', "comparison": {"left": "...", "center": "...", "right": "..."}' : ''}}
${block('left')}${block('center')}${block('right')}`;
}

// Ranks sentences by how much vocabulary they share with the rest of the coverage.
// What the whole press pack independently says rises to the top.
function extractive(story) {
  // Prefer real dek sentences. Headlines are compressed and telegraphic, so a summary
  // built from them reads like a list of headlines - which is what it would be.
  const withDek = story.articles.filter((a) => a.dek && a.dek.length > 80);
  const useDeks = withDek.length >= 3;
  const source = useDeks ? withDek : story.articles;

  const pool = [];
  const seen = new Set();
  for (const a of source) {
    const text = useDeks ? a.dek : (a.dek || a.title);
    for (const sent of sentences(text).slice(0, 2)) {
      if (sent.length < 60 || sent.length > 320) continue;
      // Feed boilerplate that adds nothing.
      if (/^(by |photo|image|read more|subscribe|sign up|advertisement|watch:|listen)/i.test(sent)) continue;
      if (/(cookies|newsletter|all rights reserved|click here)/i.test(sent)) continue;
      const norm = sent.toLowerCase().replace(/\W+/g, ' ').trim().slice(0, 90);
      if (seen.has(norm)) continue;
      seen.add(norm);
      pool.push({ sent, terms: new Set(tokens(sent)), source: a.source });
    }
    if (pool.length >= 60) break;
  }
  if (!pool.length) return story.dek ? [story.dek] : [story.title];

  const df = new Map();
  for (const p of pool) for (const t of p.terms) df.set(t, (df.get(t) ?? 0) + 1);

  for (const p of pool) {
    let score = 0;
    for (const t of p.terms) score += (df.get(t) - 1) / pool.length;
    // Normalize so a long sentence does not win on volume alone.
    p.score = score / Math.sqrt(p.terms.size || 1);
  }

  const picked = [];
  for (const p of [...pool].sort((a, b) => b.score - a.score)) {
    if (picked.length >= 4) break;
    // Skip anything that mostly repeats a bullet already chosen.
    if (picked.some((q) => overlap(q.terms, p.terms) > 0.42)) continue;
    picked.push(p);
  }
  return picked.map((p) => p.sent);
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / Math.min(a.size, b.size);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
