#!/usr/bin/env node
// Guards the two hand-edited files. The source registry drives every rating on the site,
// so a typo in a bias value silently distorts the bias maths rather than crashing.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const reg = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8'));
const tax = JSON.parse(readFileSync(join(root, 'taxonomy.json'), 'utf8'));

const BIAS = new Set(reg._biasScale);
const FACT = new Set(reg._factualityScale);
const OWN = new Set(reg._ownershipScale);

const errors = [];
const warnings = [];
const seen = new Set();

for (const s of reg.sources) {
  const at = s.domain ?? s.name ?? '(unnamed)';
  for (const field of ['domain', 'name', 'bias', 'factuality', 'ownership', 'country']) {
    if (!s[field]) errors.push(`${at}: missing ${field}`);
  }
  if (s.bias && !BIAS.has(s.bias)) errors.push(`${at}: unknown bias "${s.bias}"`);
  if (s.factuality && !FACT.has(s.factuality)) errors.push(`${at}: unknown factuality "${s.factuality}"`);
  if (s.ownership && !OWN.has(s.ownership)) errors.push(`${at}: unknown ownership "${s.ownership}"`);
  if (seen.has(s.domain)) errors.push(`${at}: duplicate domain`);
  seen.add(s.domain);
  if (!s.feeds?.length) errors.push(`${at}: no feeds`);
  for (const f of s.feeds ?? []) {
    if (!/^https?:\/\//.test(f)) errors.push(`${at}: feed is not a URL: ${f}`);
  }
  if (!s.ratingSources?.length) warnings.push(`${at}: no ratingSources recorded`);
}

const topicIds = new Set();
for (const t of tax.topics) {
  if (!t.id || !t.name || !t.any?.length) errors.push(`topic ${t.id ?? '?'}: incomplete`);
  if (topicIds.has(t.id)) errors.push(`topic ${t.id}: duplicate id`);
  topicIds.add(t.id);
  for (const p of t.any ?? []) {
    // A short pattern is fine when it is deliberately space-padded (" ai " must not
    // match "said"). A short bare one will match inside longer words.
    const padded = p !== p.trim();
    if (p.trim().length < 2) errors.push(`topic ${t.id}: pattern "${p}" is empty`);
    else if (p.trim().length < 4 && !padded) {
      errors.push(`topic ${t.id}: pattern "${p}" is short and unpadded; it will match inside other words. Pad it with spaces.`);
    }
  }
}

// A registry skewed to one side makes every story look like a blindspot for the other.
// This is the single easiest way to get the whole product quietly wrong.
const side = (b) => (b.includes('left') ? 'L' : b.includes('right') ? 'R' : 'C');
const tally = { L: 0, C: 0, R: 0 };
for (const s of reg.sources) tally[side(s.bias)]++;
const skew = Math.abs(tally.L - tally.R) / Math.max(tally.L, tally.R, 1);
if (skew > 0.25) {
  errors.push(`spectrum is skewed: ${tally.L} left vs ${tally.R} right (${Math.round(skew * 100)}% apart). ` +
    'Blindspot detection will systematically favour one side. Add outlets to the lighter side.');
}

console.log(`${reg.sources.length} outlets, ${reg.sources.reduce((n, s) => n + s.feeds.length, 0)} feeds, ${tax.topics.length} topics`);
console.log(`spectrum: ${tally.L} left · ${tally.C} center · ${tally.R} right`);
for (const w of warnings) console.log(`  warn: ${w}`);
if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log('registry ok');
