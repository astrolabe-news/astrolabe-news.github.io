// Shared page furniture: utility bar, masthead, interest chips, footer.
import { h, icon, ICONS } from '../render.mjs';
import * as store from '../store.mjs';
import { BRAND } from '../brand.mjs';

const NAV = [
  { href: 'index.html', label: 'Home' },
  { href: 'my-bias.html', label: BRAND.reading },
  { href: 'local.html', label: 'Local' },
  { href: 'umbra.html', label: BRAND.gap.name }
];

export function chrome({ current = '', topics = [] } = {}) {
  return [utility(), promo(), masthead(current), chips(topics)];
}

function utility() {
  const s = store.state();
  const themeBtn = (value, label) =>
    h('button', {
      'aria-pressed': String((s.theme ?? 'auto') === value),
      onclick: (e) => {
        store.save({ theme: value });
        store.applyTheme(value);
        for (const b of e.target.parentElement.querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
        e.target.setAttribute('aria-pressed', 'true');
      }
    }, label);

  return h('div', { class: 'utility' },
    h('div', { class: 'wrap' },
      h('div', { class: 'utility-l' },
        h('div', { class: 'theme-switch' }, h('span', {}, 'Theme:'),
          themeBtn('light', 'Light'), themeBtn('dark', 'Dark'), themeBtn('auto', 'Auto'))
      ),
      h('div', { class: 'utility-r' },
        h('span', { class: 'date' }, new Date().toLocaleDateString(undefined,
          { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })),
        h('a', { href: 'sources.html' }, 'Source ratings')
      )
    )
  );
}

function promo() {
  return h('div', { class: 'promo' },
    h('div', { class: 'wrap' },
      h('span', {}, BRAND.promo),
      h('a', { class: 'cta', href: 'umbra.html' }, BRAND.promoCta)
    )
  );
}

function masthead(current) {
  return h('header', { class: 'masthead' },
    h('div', { class: 'wrap' },
      h('a', { class: 'wordmark', href: 'index.html', 'aria-label': `${BRAND.name} home` },
        h('span', { class: 'mark' }, BRAND.wordmark),
        h('span', { class: 'sub' }, BRAND.suffix)),
      h('nav', { class: 'nav' },
        NAV.map((n) => h('a', { href: n.href, 'aria-current': n.href === current ? 'page' : null }, n.label))),
      h('form', {
        class: 'search',
        onsubmit: (e) => {
          e.preventDefault();
          const q = new FormData(e.target).get('q')?.toString().trim();
          if (q) location.href = `search.html?q=${encodeURIComponent(q)}`;
        }
      },
        icon(ICONS.search, 15),
        h('input', { name: 'q', type: 'search', placeholder: "Search, or paste an article's URL…", 'aria-label': 'Search stories' })
      ),
      h('a', { class: 'btn-ghost', href: 'sources.html' }, 'Ratings')
    )
  );
}

function chips(topics) {
  if (!topics.length) return null;
  const follows = new Set(store.state().follows);
  return h('div', { class: 'chips' },
    h('div', { class: 'wrap' },
      h('span', { class: 'trend' }, icon(ICONS.trend, 15)),
      topics.map((t) => {
        const el = h('a', {
          class: 'chip', href: `topic.html?id=${t.id}`,
          dataset: { following: String(follows.has(t.id)) }
        }, t.name,
          h('span', {
            class: 'plus',
            role: 'button',
            'aria-label': `Follow ${t.name}`,
            onclick: (e) => {
              e.preventDefault();
              e.stopPropagation();
              const on = store.toggleFollow(t.id);
              el.dataset.following = String(on);
              e.target.textContent = on ? '✓' : '+';
            }
          }, follows.has(t.id) ? '✓' : '+')
        );
        return el;
      })
    )
  );
}

export function footer(meta) {
  const col = (title, links) => h('div', {}, h('h4', {}, title), links.map(([label, href]) => h('a', { href }, label)));
  return h('footer', { class: 'foot' },
    h('div', { class: 'wrap' },
      h('div', { class: 'cols' },
        col('News', [['Home', 'index.html'], [BRAND.gap.name, 'umbra.html'], ['Local News', 'local.html'], [BRAND.digest, 'briefing.html']]),
        col('Understand', [['Source ratings', 'sources.html'], ['How bias is rated', 'about.html#bias'], [`What is ${BRAND.gap.name}?`, 'about.html#blindspot'], [BRAND.reading, 'my-bias.html']]),
        col('Topics', (meta?.topics ?? []).slice(0, 5).map((t) => [t.name, `topic.html?id=${t.id}`])),
        col('About', [[`How ${BRAND.name} works`, 'about.html'], ['Where the data comes from', 'about.html#data'], ['Limitations', 'about.html#limits']])
      ),
      h('div', { class: 'base' },
        h('div', {}, `${BRAND.name} aggregates headlines from ${meta?.outlets ?? 0} news outlets. Bias and factuality ratings are derived from publicly published assessments by AllSides and Media Bias/Fact Check, and are applied to outlets, not to individual articles.`),
        h('div', { style: { marginTop: '8px' } }, 'Headlines and images belong to their publishers and link back to the original reporting. Free to use, no account, nothing tracked — your reading history stays in your browser.')
      )
    )
  );
}
