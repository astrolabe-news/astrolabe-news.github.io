// Cluster quality is the difference between this working and not working. This runs the
// real pipeline over live feeds and prints what actually happened, so the thresholds get
// tuned against output instead of intuition.
import { readFileSync } from 'node:fs';
import { fetchAll } from './steps/fetch.mjs';
import { embedAll } from './steps/embed.mjs';
import { cluster, loadState, DEFAULTS } from './steps/cluster.mjs';

const { sources } = JSON.parse(readFileSync(new URL('./sources.json', import.meta.url), 'utf8'));
const byDomain = new Map(sources.map((s) => [s.domain, s]));

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};

const opts = {
  joinThreshold: flag('join', DEFAULTS.joinThreshold),
  mergeThreshold: flag('merge', DEFAULTS.mergeThreshold),
  rareOverlap: flag('rare', DEFAULTS.rareOverlap)
};

console.log(`thresholds: join=${opts.joinThreshold} merge=${opts.mergeThreshold} rare=${opts.rareOverlap}\n`);

const { articles } = await fetchAll(sources, { log: () => {} });
console.log(`${articles.length} articles`);

const t = Date.now();
const vectors = await embedAll(articles, { log: () => {} });
console.log(`embedded in ${((Date.now() - t) / 1000).toFixed(1)}s`);

const state = loadState(null);
const t2 = Date.now();
const stats = cluster(articles, vectors, state, opts);
console.log(`clustered in ${((Date.now() - t2) / 1000).toFixed(1)}s`, stats);

const multi = state.clusters.filter((c) => c.articles.length > 1);
const sizes = state.clusters.map((c) => c.articles.length).sort((a, b) => b - a);
console.log(`\n${state.clusters.length} stories | ${multi.length} with 2+ sources | largest ${sizes[0]}`);
console.log(`singletons ${sizes.filter((n) => n === 1).length} | median multi-source size ${
  multi.length ? multi.map((c) => c.articles.length).sort((a, b) => a - b)[Math.floor(multi.length / 2)] : 0}`);

// Distinct outlets matters more than article count: ten wire reprints is not ten sources.
const ranked = multi
  .map((c) => ({ c, outlets: new Set(c.articles.map((a) => a.domain)).size }))
  .sort((a, b) => b.outlets - a.outlets);

console.log('\n===== TOP STORIES BY OUTLET COUNT =====');
for (const { c, outlets } of ranked.slice(0, 12)) {
  const spread = tally(c);
  console.log(`\n[${outlets} outlets] ${c.articles[0].title}`);
  console.log(`  L${spread.L} C${spread.C} R${spread.R}`);
  for (const a of c.articles.slice(0, 6)) {
    console.log(`   - ${(byDomain.get(a.domain)?.name ?? a.domain).padEnd(28)} ${a.title.slice(0, 72)}`);
  }
  if (c.articles.length > 6) console.log(`   ... +${c.articles.length - 6} more`);
}

// The failure mode worth hunting: unrelated stories fused into one cluster.
console.log('\n===== WIDEST CLUSTERS (check for false merges) =====');
for (const { c } of ranked.slice(0, 4)) {
  const titles = c.articles.map((a) => a.title);
  console.log(`\n"${titles[0].slice(0, 70)}"`);
  console.log(`  most divergent member: "${titles[titles.length - 1].slice(0, 70)}"`);
}

function tally(c) {
  const out = { L: 0, C: 0, R: 0 };
  const seen = new Set();
  for (const a of c.articles) {
    if (seen.has(a.domain)) continue;
    seen.add(a.domain);
    const b = byDomain.get(a.domain)?.bias ?? 'unrated';
    if (b.includes('left')) out.L++;
    else if (b.includes('right')) out.R++;
    else if (b === 'center') out.C++;
  }
  return out;
}
