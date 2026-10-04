// Publisher marks. These are what the capsule columns are made of, so a missing one is
// visible. Order: a hand-placed file if we have one, then DuckDuckGo's icon service,
// then a deterministic initials disc - never a broken image box.
import { h } from '../render.mjs';

// Populated for outlets whose auto-fetched favicon looks poor at 30px.
export const LOCAL = new Set([]);

const PALETTE = ['#3B6BA5', '#8E3037', '#4A6B52', '#6B4A7A', '#A56B3B', '#3B6B6B', '#7A4A4A', '#4A5A7A'];

const initials = (name) =>
  name.replace(/^(The|Le|La|El)\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function tint(domain) {
  let n = 0;
  for (let i = 0; i < domain.length; i++) n = (n * 31 + domain.charCodeAt(i)) >>> 0;
  return PALETTE[n % PALETTE.length];
}

export function logo(source, { size = '', title = true } = {}) {
  const domain = typeof source === 'string' ? source : source.domain;
  const name = (typeof source === 'string' ? source : source.name) || domain;
  const cls = `logo${size ? ` ${size}` : ''}`;

  // Google's service returns the site's 128px touch icon, which is usually opaque and
  // legible at this size. DuckDuckGo's returns the 32px favicon, which often is not -
  // so it is the fallback, not the default.
  const chain = [
    LOCAL.has(domain) ? `assets/logos/${domain}.png` : null,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${domain}.ico`
  ].filter(Boolean);

  let attempt = 0;
  const img = h('img', {
    class: cls,
    src: chain[0],
    alt: title ? name : '',
    loading: 'lazy',
    decoding: 'async',
    referrerpolicy: 'no-referrer',
    title: title ? name : null
  });

  img.addEventListener('error', () => {
    attempt++;
    if (attempt < chain.length) { img.src = chain[attempt]; return; }
    img.replaceWith(h('span', {
      class: `${cls} logo-fallback`,
      style: { background: tint(domain) },
      title: title ? name : null,
      'aria-label': title ? name : null
    }, initials(name)));
  });

  return img;
}

// The favicon row that sits under a card's bias bar.
export function logoRow(domains, byDomain, { max = 6, size = 'sm' } = {}) {
  const shown = domains.slice(0, max);
  const extra = domains.length - shown.length;
  return h('div', { class: 'srcrow' },
    shown.map((d) => logo(byDomain?.get(d) ?? d, { size })),
    extra > 0 && h('span', { class: 'plus' }, `+${extra}`)
  );
}
