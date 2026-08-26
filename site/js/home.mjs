// Home: the three-column masthead grid, then the local band, topic bands and latest list.
import { h, mount, frag, ago } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { cardHero, cardRow, cardList, cardGrid, cardBlind } from './components/card.mjs';
import { biasBar } from './components/biasbar.mjs';

const [home, meta, byDomain] = await Promise.all([store.home(), store.meta(), store.sourceMap()]);
store.applyTheme();

mount('#chrome', chrome({ current: 'index.html', topics: home.topics.slice(0, 12) }));
mount('#foot', footer({ ...meta, outlets: meta.outlets }));

const app = document.querySelector('#app');

// The masthead's three columns draw from one ranked list, so without this the biggest
// story of the day appears as the hero, the briefing lead and the first list item.
const used = new Set();
const take = (list, n) => {
  const out = [];
  for (const s of list) {
    if (out.length >= n) break;
    if (used.has(s.i)) continue;
    used.add(s.i);
    out.push(s);
  }
  return out;
};

const top = home.top;
const hero = take(top, 1)[0];
const leadRows = take(top, 7);
const topList = take(top, 6);

mount(app,
  h('div', { class: 'masthead-grid' },
    briefingColumn(),
    leadColumn(),
    sideColumn()
  ),
  localBand(),
  topicBands(),
  latestBand()
);

/* ---------- column 1: the daily briefing and the top-stories list ---------- */
function briefingColumn() {
  const b = home.briefing;
  return h('div', { class: 'col col-brief' },
    b && h('a', { class: 'brief', href: 'briefing.html' },
      b.lead.i !== hero?.i && h('img', { class: 'thumb', src: b.lead.g, alt: '', loading: 'lazy',
        referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }),
      h('div', { class: 'brief-meta' }, `${b.stories} stories • ${b.articles} articles • ${b.readMinutes}m read`),
      h('h3', { class: 'brief-hl' }, b.lead.t),
      b.lead.d && h('p', { class: 'brief-dek' }, b.lead.d),
      h('div', { class: 'brief-rest' },
        b.rest.slice(0, 4).map((r, i) => h('span', {}, i === 0 ? '+ ' : '; ', h('u', {}, r.t)))
      )
    ),
    h('div', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'Top News Stories')),
      topList.map((s) => cardList(s, byDomain))
    )
  );
}

/* ---------- column 2: hero plus the main list ---------- */
function leadColumn() {
  return h('div', { class: 'col col-lead' },
    cardHero(hero, byDomain),
    h('div', { class: 'lead-list' },
      leadRows.map((s) => cardRow(s, byDomain))
    )
  );
}

/* ---------- column 3: blindspot panel and the bias teaser ---------- */
function sideColumn() {
  const bs = [...home.blindspots.left.slice(0, 1), ...home.blindspots.right.slice(0, 1)]
    .concat(home.blindspots.right.slice(1, 2)).filter(Boolean).slice(0, 2);

  const hist = store.state().history;

  return h('div', { class: 'col col-side' },
    h('div', { class: 'blind-panel' },
      h('div', { class: 'blind-head' },
        h('span', { class: 'blind-logo' }, 'BLINDSPOT'),
      ),
      h('p', { class: 'blind-copy' }, 'Stories disproportionately covered by one side of the political spectrum. ',
        h('a', { href: 'about.html#blindspot' }, 'Learn more.')),
      bs.map((s) => cardBlind(s, byDomain)),
      h('a', { class: 'btn-ghost blind-cta', href: 'blindspot.html' }, 'View Blindspot Feed')
    ),
    h('div', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'My News Bias')),
      h('div', { class: 'mybias' },
        hist.length
          ? frag(
              h('div', { class: 'mybias-meta' }, `${hist.length} stor${hist.length === 1 ? 'y' : 'ies'} read`),
              biasBar(averageBias(hist)),
              h('a', { class: 'btn-ghost blind-cta', href: 'my-bias.html' }, 'See your full report')
            )
          : frag(
              h('div', { class: 'mybias-meta' }, 'Nothing read yet'),
              h('div', { class: 'biasbar' },
                ['left', 'center', 'right'].map((side) =>
                  h('div', { class: `seg seg-${side}`, style: { flex: 1, opacity: .35 } }, '?'))),
              h('p', { class: 'mybias-copy' }, 'Read a few stories and Fulcrum will show you the balance of what you have been reading. It is worked out in your browser and never sent anywhere.')
            )
      )
    )
  );
}

function averageBias(history) {
  const sum = history.reduce((acc, e) => [acc[0] + e.p[0], acc[1] + e.p[1], acc[2] + e.p[2]], [0, 0, 0]);
  const out = sum.map((n) => Math.round(n / history.length));
  const drift = 100 - out.reduce((a, b) => a + b, 0);
  out[out.indexOf(Math.max(...out))] += drift;
  return out;
}

/* ---------- local ---------- */
function localBand() {
  const saved = store.state().place;
  return h('section', { class: 'band band-local' },
    h('div', { class: 'band-main' },
      take(home.latest, 4).map((s) => cardRow(s, byDomain))
    ),
    h('aside', { class: 'band-side' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'Daily Local News')),
      h('p', { class: 'sec-sub' }, 'Stories and media bias where you are.'),
      h('form', {
        class: 'place-form',
        onsubmit: (e) => {
          e.preventDefault();
          const v = new FormData(e.target).get('place')?.toString().trim();
          if (v) { store.save({ place: v }); location.href = `local.html?place=${encodeURIComponent(v)}`; }
        }
      },
        h('input', { name: 'place', placeholder: 'Enter your city or state', value: saved ?? '', 'aria-label': 'Your city or state' }),
        h('button', { class: 'btn-solid', type: 'submit' }, 'Submit')
      ),
      h('div', { class: 'place-suggest' },
        home.places.slice(0, 8).map((p) => h('a', { class: 'chip', href: `local.html?place=${encodeURIComponent(p.name)}` }, p.name))
      )
    )
  );
}

/* ---------- one band per leading topic ---------- */
function topicBands() {
  const withBlind = home.topics
    .map((t) => ({
      topic: t,
      stories: home.top.concat(home.latest).filter((s) => s.tp?.some((x) => x.id === t.id)),
      blind: [...home.blindspots.left, ...home.blindspots.right].filter((s) => s.tp?.some((x) => x.id === t.id))
    }))
    .filter((b) => b.stories.length >= 2)
    .slice(0, 2);

  return frag(withBlind.map(({ topic, stories, blind }) =>
    h('section', { class: 'sec' },
      h('div', { class: 'sec-head' },
        h('h2', {}, `${topic.name} News`),
        h('div', { class: 'actions' },
          h('a', { class: 'btn-ghost', href: `topic.html?id=${topic.id}` }, 'Read more'))
      ),
      h('div', { class: 'band' },
        h('div', { class: 'band-main' },
          h('p', { class: 'sec-sub' }, `Latest ${topic.name} news`),
          cardHero(stories[0], byDomain)
        ),
        h('aside', { class: 'band-side' },
          h('p', { class: 'sec-sub' }, blind.length ? `${topic.name} Blindspots` : 'More coverage'),
          (blind.length ? blind : stories.slice(1)).slice(0, 2)
            .map((s) => (s.b ? cardBlind(s, byDomain) : cardGrid(s, byDomain)))
        )
      )
    )
  ));
}

/* ---------- latest ---------- */
function latestBand() {
  return h('section', { class: 'band' },
    h('div', { class: 'band-main' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'Latest Stories')),
      take(home.latest, 12).map((s) => cardRow(s, byDomain))
    ),
    h('aside', { class: 'band-side' },
      h('div', { class: 'sec-head' }, h('h2', {}, 'Topics')),
      h('div', { class: 'topic-list' },
        home.topics.slice(0, 12).map((t) =>
          h('a', { class: 'topic-link', href: `topic.html?id=${t.id}` },
            h('span', {}, t.name), h('span', { class: 'n' }, t.count)))
      )
    )
  );
}
