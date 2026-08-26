// Search. Also accepts a pasted article URL, which is how the original lets you look up
// the story behind something you are already reading.
import { h, mount } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { cardRow } from './components/card.mjs';
import { BRAND, titled } from './brand.mjs';

const q = (new URLSearchParams(location.search).get('q') || '').trim();
const [idx, meta, byDomain] = await Promise.all([store.index(), store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

document.title = titled(q || 'Search');

let results = [];
let note = null;

if (/^https?:\/\//i.test(q)) {
  // A pasted link: find the story containing that article.
  const host = safeHost(q);
  const path = safePath(q);
  const hit = await findByUrl(host, path);
  if (hit) {
    location.replace(`story.html?id=${hit}`);
  } else {
    note = `No story here contains that link. ${BRAND.name} only covers ${meta.outlets} outlets, and keeps stories for seven days.`;
  }
} else if (q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  results = idx
    .map((s) => {
      const hay = `${s.t} ${s.d} ${(s.tp ?? []).map((t) => t.name).join(' ')} ${s.pl ?? ''}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      if (score < terms.length) return null;
      return { s, score: score * 10 + Math.log2(s.n + 1) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60)
    .map((r) => r.s);
}

mount('#app',
  h('div', { class: 'page-head' },
    h('h1', {}, q ? `Results for “${q}”` : 'Search'),
    h('p', { class: 'intro' }, q
      ? `${results.length} stor${results.length === 1 ? 'y' : 'ies'} from the past seven days.`
      : 'Search headlines, topics and places — or paste the URL of an article to find every outlet covering that story.')),
  note ? h('p', { style: { color: 'var(--ink-2)' } }, note) : null,
  results.length
    ? h('div', { style: { maxWidth: '760px' } }, results.map((s) => cardRow(s, byDomain)))
    : q && !note
      ? h('div', { class: 'empty-state' }, h('h2', {}, 'Nothing found'),
          h('p', {}, 'Try fewer words, or a topic name like “tariffs” or “supreme court”.'))
      : null
);

async function findByUrl(host, path) {
  if (!host) return null;
  // Narrow by domain first so we only fetch a handful of story files.
  const candidates = idx.filter((s) => (s.src ?? []).some((d) => host.endsWith(d))).slice(0, 40);
  for (const c of candidates) {
    const full = await store.story(c.i).catch(() => null);
    if (full?.articles.some((a) => a.url.includes(path))) return c.i;
  }
  return null;
}

function safeHost(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } }
function safePath(u) { try { return new URL(u).pathname.replace(/\/+$/, ''); } catch { return ''; } }
