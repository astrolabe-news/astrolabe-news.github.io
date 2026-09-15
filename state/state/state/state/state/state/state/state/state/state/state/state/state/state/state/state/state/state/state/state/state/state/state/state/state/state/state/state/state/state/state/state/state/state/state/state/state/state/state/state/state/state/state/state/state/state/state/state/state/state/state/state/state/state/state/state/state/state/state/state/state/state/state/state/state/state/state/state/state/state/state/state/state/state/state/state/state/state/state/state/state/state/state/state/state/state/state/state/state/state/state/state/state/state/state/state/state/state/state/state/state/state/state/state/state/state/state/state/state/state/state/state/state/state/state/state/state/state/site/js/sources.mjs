// The full source registry, open. Every rating the story pages use is visible here,
// along with who informed it.
import { h, mount } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { logo } from './components/logo.mjs';
import { BIAS_LABEL, ORDER } from './components/capsules.mjs';
import { BRAND } from './brand.mjs';

const [sourceList, meta] = await Promise.all([store.sources(), store.meta()]);
store.applyTheme();
mount('#chrome', chrome({ topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

const OWNERSHIP = {
  'media-conglomerate': 'Media conglomerate', 'private-equity': 'Private equity', individual: 'Individual',
  government: 'Government', telecom: 'Telecom', corporation: 'Corporation', independent: 'Independent', other: 'Other'
};
const TIER = { 'very-high': 'Very high', high: 'High', mixed: 'Mixed', low: 'Low', 'very-low': 'Very low' };

let filter = 'all';
let query = '';

const counts = Object.fromEntries(ORDER.map((b) => [b, sourceList.filter((s) => s.bias === b).length]));

const table = h('div', { class: 'src-scroll' });
const paint = () => {
  const rows = sourceList
    .filter((s) => filter === 'all' || s.bias === filter)
    .filter((s) => !query || s.name.toLowerCase().includes(query) || s.domain.includes(query))
    .sort((a, b) => ORDER.indexOf(a.bias) - ORDER.indexOf(b.bias) || a.name.localeCompare(b.name));

  mount(table, rows.length
    ? h('table', { class: 'src-table' },
        h('thead', {}, h('tr', {},
          ['Outlet', 'Bias', 'Factuality', 'Ownership', 'Based in', 'Rated by'].map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((s) => h('tr', {},
          h('td', {}, h('span', { class: 'who' }, logo(s, { size: 'sm', title: false }), s.name)),
          h('td', {}, h('span', { class: 'badge', dataset: { bias: s.bias } }, BIAS_LABEL[s.bias])),
          h('td', {}, TIER[s.factuality] ?? '—'),
          h('td', {}, OWNERSHIP[s.ownership] ?? '—'),
          h('td', {}, [s.city, s.country].filter(Boolean).join(', ')),
          h('td', { style: { color: 'var(--ink-3)', fontSize: '12px' } }, (s.ratingSources ?? []).join(', '))
        ))))
    : h('p', { style: { padding: '24px 0', color: 'var(--ink-2)' } }, 'No outlets match that.'));
};

mount('#app',
  h('div', { class: 'page-head' },
    h('h1', {}, 'Source ratings'),
    h('p', { class: 'intro' },
      `Every one of the ${sourceList.length} outlets ${BRAND.name} reads, with the bias, factuality and ownership used to work out each story's coverage. `,
      'Ratings apply to the outlet as a whole, not to individual articles, and are derived from publicly published assessments by AllSides and Media Bias/Fact Check.')
  ),
  h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' } },
    h('input', {
      class: 'chip', style: { padding: '7px 11px', minWidth: '200px' },
      placeholder: 'Filter by name…', 'aria-label': 'Filter outlets',
      oninput: (e) => { query = e.target.value.toLowerCase().trim(); paint(); }
    }),
    ['all', ...ORDER].map((b) => {
      const btn = h('button', {
        class: 'chip', dataset: { following: String(b === filter) },
        onclick: () => {
          filter = b;
          for (const el of btn.parentElement.querySelectorAll('button')) el.dataset.following = 'false';
          btn.dataset.following = 'true';
          paint();
        }
      }, b === 'all' ? `All ${sourceList.length}` : `${BIAS_LABEL[b]} ${counts[b]}`);
      return btn;
    })
  ),
  table
);
paint();
