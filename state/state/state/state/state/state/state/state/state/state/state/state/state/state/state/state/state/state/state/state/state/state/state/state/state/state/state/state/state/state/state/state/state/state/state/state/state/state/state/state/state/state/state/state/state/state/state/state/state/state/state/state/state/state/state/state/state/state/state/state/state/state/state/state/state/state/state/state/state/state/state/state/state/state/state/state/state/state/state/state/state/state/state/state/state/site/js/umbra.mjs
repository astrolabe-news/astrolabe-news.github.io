// Blindspot feed: two columns, one per side, exactly as the original lays it out.
// Nothing here is gated - the whole feed is open.
import { h, mount, frag } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { cardBlind } from './components/card.mjs';
import { BRAND } from './brand.mjs';

const [idx, meta, byDomain] = await Promise.all([store.index(), store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ current: 'umbra.html', topics: meta.topics.slice(0, 12) }));
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
    h('span', { class: 'blind-logo' }, BRAND.gap.wordmark),
    h('p', {}, `${BRAND.gap.blurb} `,
      h('a', { href: 'about.html#blindspot', style: { textDecoration: 'underline' } }, 'How this is worked out.'))
  ),
  h('div', { class: 'panel', style: { marginTop: '18px' } },
    h('div', { style: { display: 'flex', gap: '34px', flexWrap: 'wrap' } },
      h('div', {},
        h('h3', {}, `${left.length} missed by the Left`),
        h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } },
          topicsOf(left).map(([, n]) => n).join(' · ') || 'Nothing today')),
      h('div', {},
        h('h3', {}, `${right.length} missed by the Right`),
        h('div', { style: { fontSize: '13px', color: 'var(--ink-2)' } },
          topicsOf(right).map(([, n]) => n).join(' · ') || 'Nothing today'))
    ),
    meta.baseline && h('p', { style: { fontSize: '12.5px', color: 'var(--ink-2)', margin: '14px 0 0', lineHeight: '1.55', maxWidth: '78ch' } },
      `Judged against how much each side normally covers. Across the ${meta.eligible} stories with enough coverage to assess, `,
      `the average one is carried by ${meta.baseline.left}% left-leaning, ${meta.baseline.center}% centre and ${meta.baseline.right}% right-leaning outlets. `,
      'A story lands here when one side is running it at less than half of that side\'s usual rate — not when it falls below a fixed percentage, which would just punish whichever side publishes less.')
  ),
  h('div', { class: 'blind-cols' },
    column(BRAND.gap.left, BRAND.gap.leftSub, left),
    column(BRAND.gap.right, BRAND.gap.rightSub, right)
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
          'Nothing on this side right now. That is a real result rather than a gap: the feed only lists stories that clear the threshold.')
  );
}
