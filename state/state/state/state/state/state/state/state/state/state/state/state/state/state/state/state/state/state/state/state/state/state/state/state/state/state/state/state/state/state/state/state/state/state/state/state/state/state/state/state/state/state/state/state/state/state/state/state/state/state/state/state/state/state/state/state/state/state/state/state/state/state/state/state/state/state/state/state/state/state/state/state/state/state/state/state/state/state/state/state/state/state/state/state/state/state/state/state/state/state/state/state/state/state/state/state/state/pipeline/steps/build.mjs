// Emits the static JSON the site reads. Nothing here is committed - the workflow builds
// it fresh each run and hands site/ to Pages as an artifact.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const HOUR = 3600e3;

export async function build(stories, sources, taxonomy, outDir, { log = console.log, blindspot = null } = {}) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'story'), { recursive: true });

  const ranked = [...stories].sort((a, b) => rank(b) - rank(a));

  // Full detail, one file per story, fetched only when a story is opened.
  let written = 0;
  await Promise.all(ranked.map(async (s) => {
    await writeFile(join(outDir, 'story', `${s.id}.json`), JSON.stringify(s));
    written++;
  }));

  const index = ranked.map(compact);
  await writeFile(join(outDir, 'index.json'), JSON.stringify(index));

  const blindspots = ranked.filter((s) => s.blindspot);
  const home = {
    builtAt: Date.now(),
    briefing: buildBriefing(ranked),
    top: ranked.slice(0, 24).map(compact),
    latest: [...ranked].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40).map(compact),
    blindspots: {
      left: blindspots.filter((s) => s.blindspot.side === 'left').slice(0, 12).map(compact),
      right: blindspots.filter((s) => s.blindspot.side === 'right').slice(0, 12).map(compact)
    },
    topics: topTopics(ranked, taxonomy),
    places: topPlaces(ranked)
  };
  await writeFile(join(outDir, 'home.json'), JSON.stringify(home));

  await writeFile(join(outDir, 'sources.json'), JSON.stringify({
    sources: sources.map((s) => ({
      domain: s.domain, name: s.name, bias: s.bias, factuality: s.factuality,
      ownership: s.ownership, country: s.country, city: s.city, ratingSources: s.ratingSources
    }))
  }));

  await writeFile(join(outDir, 'meta.json'), JSON.stringify({
    builtAt: Date.now(),
    stories: ranked.length,
    articles: ranked.reduce((n, s) => n + s.articles.length, 0),
    outlets: sources.length,
    blindspots: blindspots.length,
    // The corpus baseline is what blindspot detection is measured against, so the feed
    // can show its own working.
    baseline: blindspot?.baseline ?? null,
    eligible: blindspot?.eligible ?? 0,
    topics: taxonomy.topics.map((t) => ({ id: t.id, name: t.name }))
  }));

  log(`  wrote ${written} story files, ${index.length} index entries, ${blindspots.length} blindspots`);
  return { stories: ranked.length, blindspots: blindspots.length };
}

// Prominence is how many distinct outlets picked it up, decayed by age. A story carried
// by 30 outlets yesterday outranks one carried by 3 an hour ago.
function rank(s) {
  const ageH = Math.max(0, (Date.now() - s.updatedAt) / HOUR);
  return Math.log2(s.coverage.total + 1) * 10 - ageH * 0.6;
}

// Short keys: this index holds every story and is downloaded on first paint.
function compact(s) {
  return {
    i: s.id, s: s.slug, t: s.title, g: s.image, d: s.dek?.slice(0, 180) ?? '',
    ts: s.publishedAt, u: s.updatedAt,
    n: s.coverage.total, a: s.coverage.articles,
    p: [s.coverage.pct.left, s.coverage.pct.center, s.coverage.pct.right],
    src: topOutlets(s),
    b: s.blindspot ? [s.blindspot.side, s.blindspot.share, s.blindspot.versusNormal] : null,
    tp: s.topics, pl: s.place?.name ?? null,
    f: s.factuality?.label ?? null
  };
}

// The favicon row under each card needs a handful of domains, ordered across the
// spectrum so the row itself reads as a spread rather than a clump.
function topOutlets(s, max = 8) {
  const order = ['center', 'lean-left', 'lean-right', 'left', 'right', 'far-left', 'far-right'];
  const out = [];
  for (const bucket of order) {
    for (const d of s.coverage.buckets[bucket] ?? []) {
      if (out.length < max) out.push(d);
    }
  }
  return out;
}

// A digest of the day's biggest stories, with a read time derived from real article counts.
function buildBriefing(ranked) {
  const cutoff = Date.now() - 24 * HOUR;
  const picks = ranked.filter((s) => s.updatedAt >= cutoff && s.coverage.total >= 4).slice(0, 7);
  if (!picks.length) return null;
  const articles = picks.reduce((n, s) => n + s.coverage.articles, 0);
  return {
    stories: picks.length,
    articles,
    readMinutes: Math.max(2, Math.round(picks.length * 1.1)),
    lead: compact(picks[0]),
    rest: picks.slice(1).map((s) => ({ i: s.id, s: s.slug, t: s.title }))
  };
}

function topTopics(ranked, taxonomy) {
  const counts = new Map();
  for (const s of ranked) {
    for (const t of s.topics) {
      const e = counts.get(t.id) ?? { id: t.id, name: t.name, count: 0 };
      e.count++;
      counts.set(t.id, e);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 20);
}

function topPlaces(ranked) {
  const counts = new Map();
  for (const s of ranked) {
    if (!s.place?.name) continue;
    const e = counts.get(s.place.name) ?? { name: s.place.name, count: 0 };
    e.count++;
    counts.set(s.place.name, e);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 24);
}
