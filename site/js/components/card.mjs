// Every card variant on the site. Anatomy follows the original: image, kicker, headline,
// bias bar, coverage line, then the row of publisher marks.
import { h, shortAgo } from '../render.mjs';
import { biasBar, spread, coverageLine } from './biasbar.mjs';
import { logoRow } from './logo.mjs';
import { BRAND } from '../brand.mjs';

const href = (s) => `story.html?id=${s.i}`;

const kicker = (s) => [s.tp?.[0]?.name, s.pl].filter(Boolean).join(' · ');

// A story with no usable image still needs to fill its slot. A deterministic gradient
// keyed off the id is quieter than a broken-image box and never repeats jarringly.
export function thumb(s, cls = 'thumb') {
  if (s.g) {
    const img = h('img', {
      class: cls, src: s.g, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer'
    });
    img.addEventListener('error', () => img.replaceWith(gradient(s, cls)), { once: true });
    return img;
  }
  return gradient(s, cls);
}

function gradient(s, cls) {
  let n = 0;
  for (const ch of s.i) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  const a = n % 360;
  return h('div', {
    class: cls, 'aria-hidden': 'true',
    style: { background: `linear-gradient(135deg, hsl(${a} 18% 62%), hsl(${(a + 42) % 360} 20% 42%))` }
  });
}

export function cardHero(s, byDomain) {
  return h('a', { class: 'card card-hero', href: href(s) },
    thumb(s),
    h('div', { class: 'overlay' },
      kicker(s) && h('div', { class: 'kicker' }, kicker(s)),
      h('h3', { class: 'hl' }, s.t),
      biasBar(s.p)
    )
  );
}

export function cardGrid(s, byDomain) {
  return h('a', { class: 'card card-grid', href: href(s) },
    thumb(s),
    h('div', { class: 'kicker', style: { marginTop: '9px' } }, kicker(s)),
    h('h3', { class: 'hl' }, s.t),
    h('div', { style: { marginTop: '9px' } }, biasBar(s.p, { slim: true })),
    coverageLine(s.p, s.n),
    h('div', { style: { marginTop: '7px' } }, logoRow(s.src ?? [], byDomain, { max: 7 }))
  );
}

export function cardRow(s, byDomain, { image = true } = {}) {
  const body = h('div', {},
    h('div', { class: 'kicker' }, kicker(s)),
    h('h3', { class: 'hl' }, s.t),
    h('div', { style: { marginTop: '8px' } }, biasBar(s.p, { slim: true })),
    coverageLine(s.p, s.n),
    h('div', { style: { marginTop: '7px' } }, logoRow(s.src ?? [], byDomain, { max: 6 }))
  );
  return h('a', { class: `card card-row${image && s.g ? '' : ' no-img'}`, href: href(s) },
    body, image && s.g ? thumb(s) : null);
}

export function cardList(s, byDomain) {
  return h('a', { class: 'card card-list', href: href(s) },
    h('h3', { class: 'hl' }, s.t),
    h('div', { style: { marginTop: '7px' } }, biasBar(s.p, { slim: true })),
    coverageLine(s.p, s.n)
  );
}

export function cardBlind(s, byDomain) {
  const [side, share] = s.b;
  return h('a', { class: 'card card-blind', dataset: { side }, href: href(s) },
    thumb(s),
    h('div', { class: 'body' },
      h('div', { class: 'meta' },
        h('span', { class: 'blindtag' }, BRAND.gap.name,
          h('span', { class: 'pill' }, share === 0
            ? `0% ${side === 'left' ? 'Left' : 'Right'}`
            : `Only ${share}% ${side === 'left' ? 'Left' : 'Right'}`)),
        h('span', { class: 'count' }, `${s.n} sources`)
      ),
      h('h3', { class: 'hl' }, s.t),
      spread(s.p),
      s.b[2] != null && h('div', { class: 'cov', style: { marginTop: '8px' } },
        s.b[2] === 0
          ? `No ${side} coverage at all`
          : `About ${Math.round(s.b[2])}% of the ${side} coverage this story would normally get`)
    )
  );
}

export const stamp = (s) => `${shortAgo(s.u)} ago`;
