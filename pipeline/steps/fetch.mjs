// Pulls every feed in the registry. Feeds break constantly - publishers rename them,
// rate-limit them, or let them 404 - so every failure is isolated and reported, never fatal.
import { parseFeed, canonicalize } from '../lib/rss.mjs';

const UA = 'Mozilla/5.0 (compatible; AstrolabeNewsBot/0.1; +https://github.com/astrolabe-news)';
const TIMEOUT_MS = 15000;
const CONCURRENCY = 24;

export async function fetchAll(sources, { limit = 0, log = console.log } = {}) {
  const jobs = [];
  for (const source of sources) {
    for (const url of source.feeds) jobs.push({ source, url });
  }

  const articles = [];
  const failures = [];
  let done = 0;

  await pool(jobs, CONCURRENCY, async (job) => {
    try {
      const xml = await get(job.url);
      const parsed = parseFeed(xml, job.source, job.url);
      if (!parsed.length) throw new Error('no items parsed');
      articles.push(...parsed);
    } catch (err) {
      failures.push({ feed: job.url, source: job.source.name, error: String(err.message || err) });
    } finally {
      done++;
      if (done % 20 === 0) log(`  fetched ${done}/${jobs.length} feeds`);
    }
  });

  const deduped = dedupe(articles);
  log(`  ${jobs.length} feeds -> ${articles.length} items -> ${deduped.length} unique articles`);
  if (failures.length) {
    log(`  ${failures.length} feed(s) failed:`);
    for (const f of failures) log(`    ${f.source}: ${f.error}`);
  }

  const sorted = deduped.sort((a, b) => b.publishedAt - a.publishedAt);
  return { articles: limit ? sorted.slice(0, limit) : sorted, failures };
}

async function get(url, redirects = 3) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (!body.trim()) throw new Error('empty body');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Same story syndicated across two of a publisher's feeds, or reachable at two URLs.
function dedupe(articles) {
  const byUrl = new Map();
  for (const a of articles) {
    const key = canonicalize(a.url);
    const prev = byUrl.get(key);
    // Keep the copy carrying the most metadata.
    if (!prev || score(a) > score(prev)) byUrl.set(key, a);
  }
  const byTitle = new Map();
  for (const a of byUrl.values()) {
    const key = `${a.domain}::${a.title.toLowerCase()}`;
    if (!byTitle.has(key)) byTitle.set(key, a);
  }
  return [...byTitle.values()];
}

const score = (a) => (a.image ? 2 : 0) + (a.dek ? 1 : 0);

async function pool(items, size, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}
