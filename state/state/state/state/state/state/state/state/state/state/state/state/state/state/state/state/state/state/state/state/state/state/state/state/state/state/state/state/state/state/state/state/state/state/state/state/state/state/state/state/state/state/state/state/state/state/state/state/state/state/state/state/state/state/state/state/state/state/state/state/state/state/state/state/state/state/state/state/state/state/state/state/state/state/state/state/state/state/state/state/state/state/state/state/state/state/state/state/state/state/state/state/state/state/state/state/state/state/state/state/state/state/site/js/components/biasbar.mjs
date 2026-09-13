// Two distinct bar components. The stacked bar goes on cards and story pages; the
// three-track spread goes on blindspot cards, where each side needs its own reading.
import { h } from '../render.mjs';

const LABEL = { left: 'L', center: 'C', right: 'R' };

// A segment narrower than this cannot hold its own label legibly.
const INSIDE_MIN = 13;

export function biasBar(pct, { slim = false, showOutside = true } = {}) {
  const parts = [
    { side: 'left', v: pct[0] ?? pct.left ?? 0 },
    { side: 'center', v: pct[1] ?? pct.center ?? 0 },
    { side: 'right', v: pct[2] ?? pct.right ?? 0 }
  ];
  const total = parts.reduce((n, p) => n + p.v, 0);
  if (!total) return h('div', { class: `biasbar${slim ? ' slim' : ''}` }, h('div', { class: 'seg', style: { flex: 1, background: 'var(--panel)' } }));

  const bar = h('div', {
    class: `biasbar${slim ? ' slim' : ''}`,
    role: 'img',
    'aria-label': `Coverage: ${parts.map((p) => `${p.v}% ${p.side}`).join(', ')}`
  },
    parts.filter((p) => p.v > 0).map((p) =>
      h('div', {
        class: `seg seg-${p.side}${p.v < INSIDE_MIN ? ' narrow' : ''}`,
        style: { flex: `${p.v} 0 0` }
      }, slim ? null : `${LABEL[p.side]} ${p.v}%`)
    )
  );

  if (slim || !showOutside) return bar;

  // Anything too narrow to label inside gets its label alongside the bar instead.
  const hidden = parts.filter((p) => p.v > 0 && p.v < INSIDE_MIN);
  if (!hidden.length) return bar;
  return h('div', { class: 'biasbar-row' }, bar,
    h('span', { class: 'outside' }, hidden.map((p) => `${LABEL[p.side]} ${p.v}%`).join(' ')));
}

// The blindspot card's bar: one labelled track per side.
export function spread(pct) {
  const rows = [
    { side: 'left', label: 'Left', v: pct[0] ?? pct.left ?? 0 },
    { side: 'center', label: 'Center', v: pct[1] ?? pct.center ?? 0 },
    { side: 'right', label: 'Right', v: pct[2] ?? pct.right ?? 0 }
  ];
  return h('div', { class: 'spread' },
    rows.map((r) => h('div', { class: 'spread-row', dataset: { side: r.side } },
      h('span', { class: 'lbl' }, r.label),
      h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${r.v}%` } })),
      h('span', { class: 'val' }, `${r.v}%`)
    ))
  );
}

// "39% Left coverage: 187 sources"
export function coverageLine(pct, total) {
  const parts = [['Left', pct[0]], ['Center', pct[1]], ['Right', pct[2]]].sort((a, b) => b[1] - a[1]);
  const [side, v] = parts[0];
  return h('div', { class: 'cov' },
    h('b', {}, `${v}% ${side} coverage`), `: ${total} source${total === 1 ? '' : 's'}`);
}
