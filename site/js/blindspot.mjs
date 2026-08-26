// Blindspot feed: two columns, one per side, exactly as the original lays it out.
// Nothing here is gated - the whole feed is open.
import { h, mount, frag } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { cardBlind } from './components/card.mjs';

const [idx, meta, byDomain] = await Promise.all([store.index(), store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ current: 'blindspot.html', topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

const all = idx.filter((s) => s.b);
const left = all.filter((s) => s.b[0] === 'left');
const right = all.filter((s) => s.b[0] === 'right');

const topicsOf = (list) => {
  const seen = new Map();
  for (const s of list) for (const t of s.tp ?? []) seen.set(t.id, t.name);
  return [...seen.entries()].slice(0, 4);
};

mount('#app',
  h('div', { class: 'blind-masthead' },
    h('span', { class: 'blind-logo' }, 'BLINDSPOT'),
    h('p', {}, 'Political stories that one side of the spectrum is barely reporting. ',
      h('a', { href: 'about.html#blindspot', style: { textDecoration: 'underline' } }, 'How a Blindspot is worked out.'))
  ),
  h('div', { class: 'panel', style: { marginTop: '18px' } },
    h('div', { style: { display: 'flex', gap: '30px', flexWrap: 'wrap' } },
      h('div', {},
        h('h3', {}, `${left.length} for the Left`),
        h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } },
          topicsOf(left).map(([, n]) => n).join(' · ') || 'Nothing today')),
      h('div', {},
        h('h3', {}, `${right.length} for the Right`),
        h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } },
          topicsOf(right).map(([, n]) => n).join(' · ') || 'Nothing today'))
    )
  ),
  h('div', { class: 'blind-cols' },
    column('For the Left', 'Stories that had little to no reporting on the Left.', left),
    column('For the Right', 'Stories that had little to no reporting on the Right.', right)
  ),
  h('section', { class: 'sec' },
    h('div', { class: 'sec-head' }, h('h2', {}, 'Trending Topics')),
    h('div', { class: 'place-suggest' },
      meta.topics.slice(0, 16).map((t) => h('a', { class: 'chip', href: `topic.html?id=${t.id}` }, t.name)))
  )
);

function column(title, sub, list) {
  return h('div', {},
    h('h2', {}, title),
    h('p', { class: 'sec-sub' }, sub),
    list.length
      ? h('div', { class: 'blind-grid' }, list.map((s) => cardBlind(s, byDomain)))
      : h('p', { style: { fontSize: '14px', color: 'var(--ink-2)', paddingTop: '10px' } },
          'No blindspots on this side right now. That happens on quiet news days, and it is a real result rather than a gap — the feed only lists stories that clear the threshold.')
  );
}
