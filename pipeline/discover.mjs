#!/usr/bin/env node
// Feed discovery. Publishers move and kill their RSS constantly, so hand-collecting feed
// URLs does not scale and does not stay correct. This tries the usual patterns for a
// domain, falls back to the site's own <link rel="alternate"> advertisement, and finally
// to a Google News headline index - which works for any outlet but yields headlines only.
//
//   node pipeline/discover.mjs candidates.json   -> prints rows ready for sources.json
//   node pipeline/discover.mjs --recheck          -> re-tests every feed already in the registry
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed } from './lib/rss.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (compatible; FulcrumNewsBot/0.1; +https://github.com/fulcrum-news)';
const TIMEOUT = 12000;
const MIN_ITEMS = 4;

const PATTERNS = [
  '/feed/', '/rss', '/rss.xml', '/feed.xml', '/feeds/rss', '/index.rss', '/rss/index.xml',
  '/arc/outboundfeeds/rss/?outputType=xml', '/feeds/all.rss', '/news/feed/', '/latest/feed/',
  '/rssfeeds/news.xml', '/api/rss', '/en/rss'
];

export const googleNews = (domain) =>
  `https://news.google.com/rss/search?q=when:24h+site:${domain}&hl=en-US&gl=US&ceid=US:en`;

async function get(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(timer); }
}

async function tryFeed(url, source) {
  try {
    const body = await get(url);
    const items = parseFeed(body, source, url);
    return items.length >= MIN_ITEMS ? { url, items: items.length, sample: items[0].title } : null;
  } catch { return null; }
}

// Most news sites advertise their feed in <head>. Cheaper and more reliable than guessing.
async function fromHomepage(domain, source) {
  try {
    const html = await get(`https://${domain}/`);
    const urls = [...html.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
      .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1])
      .filter(Boolean)
      .map((href) => (href.startsWith('http') ? href : new URL(href, `https://${domain}/`).toString()))
      .filter((u) => !/comments?\/feed/i.test(u))
      .slice(0, 4);
    for (const u of urls) {
      const hit = await tryFeed(u, source);
      if (hit) return hit;
    }
  } catch { /* homepage blocked; fall through */ }
  return null;
}

export async function discover(domain, name) {
  const source = { domain, name: name ?? domain };
  for (const p of PATTERNS) {
    const hit = await tryFeed(`https://${domain}${p}`, source);
    if (hit) return { ...hit, kind: 'native' };
  }
  const advertised = await fromHomepage(domain, source);
  if (advertised) return { ...advertised, kind: 'native' };
  const gn = await tryFeed(googleNews(domain), source);
  if (gn) return { ...gn, kind: 'google-news' };
  return null;
}

async function pool(items, size, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

/* ---------- cli ---------- */
const arg = process.argv[2];

if (arg === '--recheck') {
  const { sources } = JSON.parse(readFileSync(join(root, 'sources.json'), 'utf8'));
  const dead = [];
  let done = 0;
  await pool(sources, 12, async (s) => {
    let ok = 0;
    for (const f of s.feeds) if (await tryFeed(f, s)) ok++;
    if (!ok) dead.push(s);
    if (++done % 25 === 0) console.error(`  checked ${done}/${sources.length}`);
  });
  console.log(`${sources.length - dead.length}/${sources.length} outlets have a working feed`);
  if (dead.length) {
    console.log('\ndead:');
    for (const s of dead) console.log(`  ${s.name} (${s.domain})`);
  }
} else if (arg) {
  const candidates = JSON.parse(readFileSync(arg, 'utf8'));
  const found = [];
  const missing = [];
  let done = 0;
  await pool(candidates, 10, async (c) => {
    const hit = await discover(c.domain, c.name);
    if (hit) found.push({ ...c, feeds: [hit.url], _kind: hit.kind, _items: hit.items });
    else missing.push(c);
    if (++done % 20 === 0) console.error(`  probed ${done}/${candidates.length}`);
  });
  console.error(`\nfound ${found.length}/${candidates.length}  (native ${found.filter((f) => f._kind === 'native').length}, google-news ${found.filter((f) => f._kind !== 'native').length})`);
  if (missing.length) console.error(`no feed: ${missing.map((m) => m.domain).join(', ')}`);
  console.log(JSON.stringify(found, null, 1));
} else {
  console.error('usage: discover.mjs <candidates.json> | --recheck');
  process.exit(1);
}
