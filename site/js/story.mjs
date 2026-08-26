// Story page: the summary and article list on the left, the coverage anatomy on the right.
import { h, mount, frag, ago, shortAgo } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { biasBar } from './components/biasbar.mjs';
import { capsules, untracked, BIAS_LABEL } from './components/capsules.mjs';
import { logo } from './components/logo.mjs';
import { cardRow } from './components/card.mjs';

const id = new URLSearchParams(location.search).get('id');
const [meta, byDomain] = await Promise.all([store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

let s;
try {
  s = await store.story(id);
} catch {
  mount('#app', h('div', { class: 'empty-state' },
    h('h2', {}, 'Story not found'),
    h('p', {}, 'It may have aged out of the feed. Stories are kept for seven days.'),
    h('p', { style: { marginTop: '16px' } }, h('a', { class: 'btn-solid', href: 'index.html' }, 'Back to the front page'))));
  throw new Error('not found');
}

document.title = `${s.title} — Fulcrum`;
store.recordRead(s);

const OWNERSHIP = {
  'media-conglomerate': 'Media conglomerate', 'private-equity': 'Private equity', individual: 'Individual',
  government: 'Government', telecom: 'Telecom', corporation: 'Corporation', independent: 'Independent', other: 'Other'
};

let tab = 'all';
let side = 'center';

/* ---------- left column ---------- */
function mainCol() {
  const el = h('div', {});
  const render = () => mount(el,
    h('div', { class: 'story-meta' },
      `Published ${ago(s.publishedAt)}`,
      s.place?.name ? ` · ${s.place.name}` : '',
      s.updatedAt > s.publishedAt ? ` · Updated ${ago(s.updatedAt)}` : ''),
    h('h1', { class: 'story-title' }, s.title),
    s.dek && h('p', { class: 'story-dek' }, s.dek),
    s.comparison ? comparisonToggle(render) : null,
    h('ul', { class: 'summary' },
      (s.comparison && side !== 'general' && s.comparison[side]
        ? [s.comparison[side]]
        : s.summary ?? []).map((line) => h('li', {}, line))),
    h('div', { class: 'summary-foot' },
      h('span', {}, s.summarySource === 'gemini'
        ? 'Summarised from the coverage above by AI. Check the sources.'
        : 'Assembled from the sentences the coverage has in common. No AI was used.'),
      h('a', { href: 'about.html#summaries' }, 'How this works')),
    articleSection()
  );
  render();
  return el;
}

function comparisonToggle(render) {
  const btn = (key, label) => h('button', {
    'aria-pressed': String(side === key),
    disabled: key !== 'general' && !s.comparison[key],
    onclick: () => { side = key; render(); }
  }, label);
  return frag(
    h('div', { class: 'seg-toggle' }, btn('left', 'Left'), btn('center', 'Center'), btn('right', 'Right')),
    h('button', {
      class: 'btn-ghost', style: { marginLeft: '10px' },
      'aria-pressed': String(side === 'general'),
      onclick: () => { side = 'general'; render(); }
    }, 'Full summary')
  );
}

function articleSection() {
  const counts = {
    all: s.articles.length,
    left: s.articles.filter((a) => a.side === 'left').length,
    center: s.articles.filter((a) => a.side === 'center').length,
    right: s.articles.filter((a) => a.side === 'right').length
  };
  const list = h('div', {});
  const paint = () => mount(list,
    s.articles.filter((a) => tab === 'all' || a.side === tab).map(articleRow));

  const tabBtn = (key, label) => h('button', {
    'aria-pressed': String(tab === key),
    onclick: (e) => {
      tab = key;
      for (const b of e.target.closest('.art-tabs').children) b.setAttribute('aria-pressed', 'false');
      e.target.setAttribute('aria-pressed', 'true');
      paint();
    }
  }, label, key !== 'all' && h('span', { class: 'n' }, counts[key]));

  paint();
  return frag(
    h('div', { class: 'art-head' },
      h('h2', {}, `${s.articles.length} Article${s.articles.length === 1 ? '' : 's'}`),
      h('div', { class: 'art-tabs' },
        tabBtn('all', 'All'), tabBtn('left', 'Left'), tabBtn('center', 'Center'), tabBtn('right', 'Right'))),
    list,
    h('p', { class: 'broke' },
      h('b', {}, s.brokeFirst.source), ' broke the news ', ago(s.brokeFirst.publishedAt), '.'),
    related()
  );
}

function articleRow(a) {
  const src = byDomain.get(a.domain);
  return h('a', { class: 'art', href: a.url, target: '_blank', rel: 'noopener noreferrer' },
    h('div', { class: 'art-top' },
      logo(src ?? a.domain, { size: 'sm', title: false }),
      h('span', { class: 'name' }, a.source),
      h('span', { class: 'right' },
        a.ownership && h('span', { class: 'chip-flat' }, OWNERSHIP[a.ownership] ?? a.ownership),
        a.factuality && h('span', { class: 'chip-flat' }, `${tierLabel(a.factuality)} factuality`),
        h('span', { class: 'badge', dataset: { bias: a.bias } }, BIAS_LABEL[a.bias] ?? a.bias))),
    h('div', { class: 'art-hl' }, a.title),
    h('div', { class: 'art-when' }, `${ago(a.publishedAt)}${a.place ? ` · ${a.place}` : ''}`)
  );
}

const tierLabel = (t) => ({ 'very-high': 'Very high', high: 'High', mixed: 'Mixed', low: 'Low', 'very-low': 'Very low' }[t] ?? t);

/* ---------- right column ---------- */
function sideCol() {
  const c = s.coverage;
  return frag(
    h('div', { class: 'panel side-panel' },
      h('h3', {}, 'Coverage Details'),
      stat('Total News Sources', c.total),
      stat('Leaning Left', c.sides.left),
      stat('Center', c.sides.center),
      stat('Leaning Right', c.sides.right),
      stat('Articles', c.articles),
      stat('Last Updated', `${shortAgo(s.updatedAt)} ago`)
    ),
    h('div', { class: 'panel side-panel' },
      h('h3', {}, 'Bias Distribution'),
      h('p', { class: 'bias-note' }, biggestNote(c.pct)),
      biasBar([c.pct.left, c.pct.center, c.pct.right]),
      h('div', { class: 'capsules-wrap' }, capsules(c.buckets, byDomain)),
      untracked(c.untracked, byDomain)
    ),
    s.factuality && h('div', { class: 'panel side-panel' },
      h('h3', {}, 'Factuality'),
      h('p', { class: 'bias-note' }, `Coverage averages ${s.factuality.label.toLowerCase()} factuality across ${c.total} sources.`),
      h('div', { class: 'factbar' },
        s.factuality.segments.map((seg) =>
          h('div', { class: 'seg', dataset: { tier: seg.tier }, style: { flex: `${seg.pct} 0 0` }, title: `${tierLabel(seg.tier)}: ${seg.pct}%` },
            seg.pct >= 16 ? `${seg.pct}%` : ''))),
      h('p', { class: 'bias-note', style: { marginTop: '9px', marginBottom: 0 } },
        s.factuality.segments.map((seg) => `${tierLabel(seg.tier)} ${seg.pct}%`).join(' · '))
    ),
    s.ownership && h('div', { class: 'panel side-panel' },
      h('h3', {}, 'Ownership'),
      s.ownership.entries.map((e) => stat(OWNERSHIP[e.type] ?? e.type, `${e.count} (${e.pct}%)`))
    )
  );
}

const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));

function biggestNote(pct) {
  const [side, v] = [['Left', pct.left], ['Center', pct.center], ['Right', pct.right]].sort((a, b) => b[1] - a[1])[0];
  return `${v}% of the sources covering this story are ${side}.`;
}

/* ---------- related ---------- */
async function related() {
  const wrap = h('div', { class: 'sec' });
  const idx = await store.index();
  const topicIds = new Set(s.topics.map((t) => t.id));
  const near = idx
    .filter((x) => x.i !== s.id && x.tp?.some((t) => topicIds.has(t.id)))
    .slice(0, 5);
  if (!near.length) return wrap;
  mount(wrap,
    h('div', { class: 'sec-head' }, h('h2', {}, 'More stories like this')),
    near.map((x) => cardRow(x, byDomain)));
  return wrap;
}

// Rendered last: the render helpers below are const-bound, so painting at the top of the
// module would hit them in the temporal dead zone.
mount('#app', h('div', { class: 'story-grid' }, h('div', {}, mainCol()), h('aside', {}, sideCol())));
