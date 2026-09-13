#!/usr/bin/env node
// Orchestrator. Fetch -> embed -> cluster -> enrich -> summarize -> build.
import { readFileSync, existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchAll } from './steps/fetch.mjs';
import { embedAll } from './steps/embed.mjs';
import { cluster, loadState, serializeState, prune } from './steps/cluster.mjs';
import { buildStory, applyBlindspots } from './steps/enrich.mjs';
import { build } from './steps/build.mjs';
import { summarizeAll } from './steps/summarize.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, '..');

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const num = (f, d) => { const i = args.indexOf(`--${f}`); return i >= 0 ? Number(args[i + 1]) : d; };

const opts = {
  limit: num('limit', 0),
  noLlm: has('no-llm'),
  dry: has('dry'),
  statePath: join(repo, 'state', 'clusters.json'),
  summaryPath: join(repo, 'state', 'summaries.json'),
  outDir: join(repo, 'site', 'data')
};

const step = (n, label) => console.log(`\n[${n}] ${label}`);
const t0 = Date.now();

const { sources } = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8'));
const taxonomy = JSON.parse(readFileSync(join(root, 'taxonomy.json'), 'utf8'));
const byDomain = new Map(sources.map((s) => [s.domain, s]));

step(1, `fetching ${sources.reduce((n, s) => n + s.feeds.length, 0)} feeds from ${sources.length} outlets`);
const { articles, failures } = await fetchAll(sources, { limit: opts.limit });

step(2, 'loading cluster state');
const state = loadState(existsSync(opts.statePath) ? readFileSync(opts.statePath, 'utf8') : null);
console.log(`  ${state.clusters.length} existing stories`);

// Only genuinely new articles are worth embedding; most of any fetch is what we already have.
const known = new Set();
for (const c of state.clusters) for (const a of c.articles) known.add(a.id);
const fresh = articles.filter((a) => !known.has(a.id));
console.log(`  ${fresh.length} new of ${articles.length} fetched`);

step(3, `embedding ${fresh.length} articles`);
const vectors = fresh.length ? await embedAll(fresh) : [];

step(4, 'clustering');
const stats = cluster(fresh, vectors, state);
const pruned = prune(state);
console.log(`  joined ${stats.joined} | new ${stats.created} | merged ${stats.merged} | pruned ${pruned} old`);

step(5, 'enriching');
const stories = state.clusters.map((c) => buildStory(c, byDomain, taxonomy));
const bl = applyBlindspots(stories);
console.log(`  ${stories.length} stories | ${bl.eligible} eligible | ${stories.filter((s) => s.blindspot).length} blindspots`);
console.log(`  corpus baseline: left ${bl.baseline.left}% · center ${bl.baseline.center}% · right ${bl.baseline.right}%`);

step(6, 'summarizing');
const summaries = await summarizeAll(stories, {
  cachePath: opts.summaryPath,
  disabled: opts.noLlm,
  budget: num('budget', 200)
});

step(7, 'building site data');
if (opts.dry) {
  console.log('  --dry: skipping writes');
} else {
  await build(stories, sources, taxonomy, opts.outDir, { blindspot: bl });
  await mkdir(dirname(opts.statePath), { recursive: true });
  await writeFile(opts.statePath, JSON.stringify(serializeState(state)));
  await writeFile(opts.summaryPath, JSON.stringify(summaries));
}

console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s | ${failures.length} feed failures`);
