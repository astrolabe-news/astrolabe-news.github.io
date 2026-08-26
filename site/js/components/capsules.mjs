// The publisher capsule columns: seven pills across the spectrum, each holding the
// outlets in that bucket. Empty buckets stay flat and grey, which is precisely what
// makes a one-sided story look one-sided at a glance.
import { h } from '../render.mjs';
import { logo } from './logo.mjs';

export const ORDER = ['far-left', 'left', 'lean-left', 'center', 'lean-right', 'right', 'far-right'];
export const BIAS_LABEL = {
  'far-left': 'Far Left', left: 'Left', 'lean-left': 'Lean Left', center: 'Center',
  'lean-right': 'Lean Right', right: 'Right', 'far-right': 'Far Right', unrated: 'Unrated'
};

export function capsules(buckets, byDomain, { perColumn = 4 } = {}) {
  return h('div', { class: 'capsules' },
    ORDER.map((bias) => {
      const domains = buckets?.[bias] ?? [];
      const shown = domains.slice(0, perColumn);
      const extra = domains.length - shown.length;
      return h('div', {
        class: `capsule${domains.length ? '' : ' empty'}`,
        dataset: { bias },
        title: `${BIAS_LABEL[bias]}: ${domains.length} source${domains.length === 1 ? '' : 's'}`
      },
        shown.map((d) => logo(byDomain.get(d) ?? d)),
        extra > 0 && h('span', { class: 'more' }, `+${extra}`)
      );
    })
  );
}

export function untracked(domains, byDomain) {
  if (!domains?.length) return null;
  return h('div', { class: 'untracked' },
    h('h4', {}, 'Untracked bias'),
    h('div', { class: 'logo-row' }, domains.slice(0, 14).map((d) => logo(byDomain.get(d) ?? d, { size: 'sm' })))
  );
}
