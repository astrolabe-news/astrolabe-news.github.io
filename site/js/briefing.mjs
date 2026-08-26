// Daily Briefing: the day's biggest stories as one read.
import { h, mount, ago } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { biasBar, coverageLine } from './components/biasbar.mjs';
import { logoRow } from './components/logo.mjs';
import { thumb } from './components/card.mjs';

const [home, meta, byDomain] = await Promise.all([store.home(), store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

const b = home.briefing;
const ids = b ? [b.lead.i, ...b.rest.map((r) => r.i)] : [];
const stories = await Promise.all(ids.map((id) => store.story(id).catch(() => null)));

mount('#app',
  h('div', { class: 'page-head' },
    h('h1', {}, 'Daily Briefing'),
    b && h('p', { class: 'intro' },
      `${b.stories} stories drawn from ${b.articles} articles, about ${b.readMinutes} minutes to read. `,
      'These are the stories the most outlets ran today, with the spread of who ran them.')),
  b
    ? h('div', { style: { maxWidth: '760px' } }, stories.filter(Boolean).map(entry))
    : h('div', { class: 'empty-state' }, h('h2', {}, 'No briefing yet'),
        h('p', {}, 'The briefing needs a day of coverage to build from. Check back shortly.'))
);

function entry(s, i) {
  const pct = [s.coverage.pct.left, s.coverage.pct.center, s.coverage.pct.right];
  return h('article', { style: { padding: '26px 0', borderBottom: '1px solid var(--rule)' } },
    h('div', { class: 'kicker', style: { marginBottom: '6px' } },
      `${i + 1} of ${stories.filter(Boolean).length} · ${s.topics[0]?.name ?? 'News'} · ${ago(s.updatedAt)}`),
    h('h2', { style: { fontSize: '25px', lineHeight: '1.18', marginBottom: '12px' } },
      h('a', { href: `story.html?id=${s.id}` }, s.title)),
    s.image && h('a', { href: `story.html?id=${s.id}`, style: { display: 'block', marginBottom: '14px' } },
      thumb({ i: s.id, g: s.image })),
    h('ul', { class: 'summary' }, (s.summary ?? []).slice(0, 3).map((line) => h('li', {}, line))),
    h('div', { style: { marginTop: '12px' } }, biasBar(pct)),
    coverageLine(pct, s.coverage.total),
    h('div', { style: { marginTop: '9px' } },
      logoRow(s.articles.map((a) => a.domain).filter((d, n, arr) => arr.indexOf(d) === n), byDomain, { max: 10 }))
  );
}
