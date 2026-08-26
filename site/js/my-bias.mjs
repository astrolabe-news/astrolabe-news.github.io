// My News Bias, computed from localStorage. No account, no server, nothing leaves the
// browser - which is also why it starts empty rather than showing a sample user.
import { h, mount, frag } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { biasBar } from './components/biasbar.mjs';
import { logo } from './components/logo.mjs';
import { BIAS_LABEL } from './components/capsules.mjs';

const [meta, byDomain] = await Promise.all([store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ current: 'my-bias.html', topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

const history = store.state().history;

if (!history.length) {
  mount('#app',
    h('div', { class: 'page-head' }, h('h1', {}, 'My news bias')),
    h('div', { class: 'empty-state' },
      h('h2', {}, 'Nothing to report yet'),
      h('p', {}, 'Read a few stories and this page will show the balance of what you have been reading — which outlets you lean on, and whether your diet skews one way.'),
      h('p', { style: { marginTop: '14px' } }, 'It is worked out in your browser from your own reading history. No account, and nothing is sent anywhere.'),
      h('p', { style: { marginTop: '20px' } }, h('a', { class: 'btn-solid', href: 'index.html' }, 'Start reading'))));
} else {
  render();
}

function render() {
  let grain = 'day';

  const avg = average(history);
  const leanLeft = history.filter((e) => e.p[0] - e.p[2] > 12).length;
  const leanRight = history.filter((e) => e.p[2] - e.p[0] > 12).length;
  const balanced = history.length - leanLeft - leanRight;

  const outlets = new Map();
  for (const e of history) {
    for (const [domain, bias] of e.src ?? []) {
      const rec = outlets.get(domain) ?? { domain, bias, n: 0 };
      rec.n++;
      outlets.set(domain, rec);
    }
  }
  const topOutlets = [...outlets.values()].sort((a, b) => b.n - a.n);

  const chartHost = h('div', {});
  const paintChart = () => mount(chartHost, chart(history, grain));
  paintChart();

  const grainBtn = (key, label) => {
    const b = h('button', {
      class: 'chip', dataset: { following: String(grain === key) },
      onclick: () => {
        grain = key;
        for (const el of b.parentElement.querySelectorAll('button')) el.dataset.following = 'false';
        b.dataset.following = 'true';
        paintChart();
      }
    }, label);
    return b;
  };

  mount('#app',
    h('div', { class: 'page-head' },
      h('h1', {}, 'My news bias'),
      h('p', { class: 'intro' }, 'Worked out in your browser from the stories you have opened. Nothing here has been sent anywhere, and clearing your browser data clears it.')),
    h('div', { class: 'bias-hero' },
      h('div', {},
        h('div', { style: { fontSize: '13.5px', color: 'var(--ink-2)', marginBottom: '10px' } },
          `${history.length} stor${history.length === 1 ? 'y' : 'ies'} read`),
        biasBar(avg),
        h('ul', { class: 'bias-facts' },
          h('li', {}, `${leanLeft} of the stories you read leaned left`),
          h('li', {}, `${balanced} were balanced`),
          h('li', {}, `${leanRight} leaned right`)),
        h('p', { style: { fontSize: '13px', color: 'var(--ink-2)', marginTop: '14px', lineHeight: '1.5' } },
          verdict(avg)),
        h('button', {
          class: 'btn-ghost', style: { marginTop: '16px' },
          onclick: () => { if (confirm('Clear your reading history? This cannot be undone.')) { store.save({ history: [] }); location.reload(); } }
        }, 'Clear my history')
      ),
      h('div', {},
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' } },
          h('h3', { style: { fontSize: '15px', fontFamily: 'var(--font-ui)' } }, 'Bias consumption over time'),
          h('div', { style: { display: 'flex', gap: '6px' } }, grainBtn('day', 'Day'), grainBtn('week', 'Week'), grainBtn('month', 'Month'))),
        chartHost)
    ),
    h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'Your top sources')),
      h('div', { class: 'src-cloud' },
        topOutlets.slice(0, 14).map((o) => h('div', { class: 'item' },
          logo(byDomain.get(o.domain) ?? o.domain, { size: 'lg' }),
          h('span', { class: 'n' }, o.n)))),
      h('div', { style: { marginTop: '22px' } },
        h('h3', { style: { fontSize: '15px', fontFamily: 'var(--font-ui)', marginBottom: '10px' } }, 'By political lean'),
        h('div', { class: 'src-scroll' },
          h('table', { class: 'src-table' },
            h('thead', {}, h('tr', {}, ['Outlet', 'Lean', 'Times seen'].map((c) => h('th', {}, c)))),
            h('tbody', {}, topOutlets.slice(0, 20).map((o) => h('tr', {},
              h('td', {}, h('span', { class: 'who' }, logo(byDomain.get(o.domain) ?? o.domain, { size: 'sm', title: false }),
                byDomain.get(o.domain)?.name ?? o.domain)),
              h('td', {}, h('span', { class: 'badge', dataset: { bias: o.bias } }, BIAS_LABEL[o.bias] ?? o.bias)),
              h('td', {}, o.n)))))))
    )
  );
}

function average(history) {
  const sum = history.reduce((a, e) => [a[0] + e.p[0], a[1] + e.p[1], a[2] + e.p[2]], [0, 0, 0]);
  const out = sum.map((n) => Math.round(n / history.length));
  const drift = 100 - out.reduce((a, b) => a + b, 0);
  out[out.indexOf(Math.max(...out))] += drift;
  return out;
}

function verdict([l, c, r]) {
  const gap = l - r;
  if (Math.abs(gap) <= 8) return 'Your reading is close to evenly split across the spectrum.';
  const side = gap > 0 ? 'left' : 'right';
  const other = gap > 0 ? 'right' : 'left';
  return `The stories you open are covered more heavily by ${side}-leaning outlets. The Blindspot feed is the quickest way to see what the ${other} is running that you are missing.`;
}

// Stacked bars, one per period, in the same left/centre/right order as everything else.
function chart(history, grain) {
  const bucket = (ts) => {
    const d = new Date(ts);
    if (grain === 'day') return d.toISOString().slice(0, 10);
    if (grain === 'month') return d.toISOString().slice(0, 7);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  };

  const groups = new Map();
  for (const e of history) {
    const k = bucket(e.at);
    const g = groups.get(k) ?? { k, l: 0, c: 0, r: 0, n: 0 };
    g.l += e.p[0]; g.c += e.p[1]; g.r += e.p[2]; g.n++;
    groups.set(k, g);
  }
  const cols = [...groups.values()].sort((a, b) => a.k.localeCompare(b.k)).slice(-12);
  const max = Math.max(...cols.map((g) => g.n), 1);

  return h('div', { class: 'chart' },
    cols.map((g) => {
      const height = Math.round((g.n / max) * 150);
      const share = (v) => Math.round((v / g.n / 100) * height);
      return h('div', { class: 'chart-col' },
        h('div', { class: 'stack', style: { height: `${height}px` }, title: `${g.k}: ${g.n} stories` },
          h('div', { class: 'chart-seg-left', style: { height: `${share(g.l)}px` } }),
          h('div', { class: 'chart-seg-center', style: { height: `${share(g.c)}px` } }),
          h('div', { class: 'chart-seg-right', style: { flex: '1 0 0' } })),
        h('span', { class: 'lbl' }, label(g.k, grain)));
    })
  );
}

function label(key, grain) {
  const d = new Date(grain === 'month' ? `${key}-01` : key);
  if (grain === 'month') return d.toLocaleDateString(undefined, { month: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
