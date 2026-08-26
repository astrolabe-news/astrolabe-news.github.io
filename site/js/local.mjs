// Place page, plus the "Local News Publishers" panel from the original - the same capsule
// columns, but showing which outlets in that place sit where on the spectrum.
import { h, mount } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { cardGrid, cardRow } from './components/card.mjs';
import { capsules, ORDER } from './components/capsules.mjs';

const params = new URLSearchParams(location.search);
const place = params.get('place') || store.state().place;
const [idx, meta, sourceList] = await Promise.all([store.index(), store.meta(), store.sources()]);
const byDomain = new Map(sourceList.map((s) => [s.domain, s]));
store.applyTheme();
mount('#chrome', chrome({ current: 'local.html', topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

if (!place) {
  mount('#app', picker('Local News', 'Pick a place to see the stories being written about it, and who is writing them.'));
} else {
  document.title = `News about ${place} — Fulcrum`;
  const needle = place.toLowerCase();
  const stories = idx.filter((s) => s.pl && s.pl.toLowerCase() === needle);
  const localOutlets = sourceList.filter(
    (s) => s.city?.toLowerCase() === needle || s.country?.toLowerCase() === needle);

  mount('#app',
    head(place, stories, localOutlets),
    h('div', { class: 'split' },
      h('div', {},
        stories.length
          ? h('div', {},
              h('div', { class: 'sec-head' }, h('h2', {}, `Top ${place} News`)),
              h('div', { class: 'feed-grid' }, stories.slice(0, 6).map((s) => cardGrid(s, byDomain))),
              stories.length > 6 && h('div', { class: 'sec-head', style: { marginTop: '26px' } }, h('h2', {}, 'More')),
              stories.slice(6, 24).map((s) => cardRow(s, byDomain)))
          : h('div', { class: 'empty-state' },
              h('h2', {}, `No stories located in ${place}`),
              h('p', {}, 'A story is placed here when its headlines name this place, so small places will often be empty. Try a state or a larger city.'))
      ),
      h('aside', {},
        localOutlets.length ? publisherPanel(localOutlets) : null,
        h('div', { class: 'panel', style: { marginTop: '18px' } },
          h('h3', {}, 'Somewhere else?'),
          picker(null, null))
      )
    )
  );
}

function head(place, stories, outlets) {
  return h('div', { class: 'page-head' },
    h('h1', {}, h('span', { class: 'avatar' }, place[0].toUpperCase()), `News about ${place}`),
    h('p', { class: 'intro' },
      `Stories Fulcrum has located in ${place} over the past seven days, with the spread of outlets covering each one. `,
      `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'}`,
      outlets.length ? `, and ${outlets.length} news outlet${outlets.length === 1 ? '' : 's'} based here.` : '.')
  );
}

// Same component as the story sidebar, showing the local press rather than one story's coverage.
function publisherPanel(outlets) {
  const buckets = Object.fromEntries(ORDER.map((b) => [b, []]));
  const untrackedList = [];
  for (const s of outlets) (buckets[s.bias] ?? untrackedList).push(s.domain);
  return h('div', { class: 'panel' },
    h('h3', {}, 'Local News Publishers'),
    h('p', { class: 'bias-note' }, 'Where the outlets based here sit on the spectrum.'),
    capsules(buckets, byDomain, { perColumn: 5 })
  );
}

function picker(title, sub) {
  return h('div', {},
    title && h('div', { class: 'page-head' }, h('h1', {}, title), sub && h('p', { class: 'intro' }, sub)),
    h('form', {
      class: 'place-form',
      style: { maxWidth: '420px', marginTop: title ? '20px' : '0' },
      onsubmit: (e) => {
        e.preventDefault();
        const v = new FormData(e.target).get('place')?.toString().trim();
        if (v) { store.save({ place: v }); location.href = `local.html?place=${encodeURIComponent(v)}`; }
      }
    },
      h('input', { name: 'place', placeholder: 'Enter a city, state or country', 'aria-label': 'Place' }),
      h('button', { class: 'btn-solid', type: 'submit' }, 'Go')),
    h('div', { class: 'place-suggest', style: { marginTop: '12px' } },
      topPlaces().map((p) => h('a', { class: 'chip', href: `local.html?place=${encodeURIComponent(p)}` }, p)))
  );
}

function topPlaces() {
  const counts = new Map();
  for (const s of idx) if (s.pl) counts.set(s.pl, (counts.get(s.pl) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([n]) => n);
}
