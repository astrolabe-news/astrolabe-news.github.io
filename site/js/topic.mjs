// Topic page. Same shape as the place page: a masthead you can follow, a plain-English
// description of what is here, then the feed.
import { h, mount } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';
import { cardGrid, cardRow, cardBlind } from './components/card.mjs';

const id = new URLSearchParams(location.search).get('id');
const [idx, meta, byDomain] = await Promise.all([store.index(), store.meta(), store.sourceMap()]);
store.applyTheme();
mount('#chrome', chrome({ topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

const topic = meta.topics.find((t) => t.id === id);
const stories = idx.filter((s) => s.tp?.some((t) => t.id === id));

if (!topic) {
  mount('#app', h('div', { class: 'empty-state' }, h('h2', {}, 'Unknown topic'),
    h('p', {}, 'Pick one from the strip at the top of any page.')));
} else {
  document.title = `${topic.name} — Fulcrum`;
  const blind = stories.filter((s) => s.b);
  mount('#app',
    head(topic, stories, blind),
    stories.length
      ? h('div', { class: 'split' },
          h('div', {},
            h('div', { class: 'sec-head' }, h('h2', {}, `Top ${topic.name} stories`)),
            h('div', { class: 'feed-grid' }, stories.slice(0, 6).map((s) => cardGrid(s, byDomain))),
            h('div', { class: 'sec-head', style: { marginTop: '26px' } }, h('h2', {}, 'More coverage')),
            stories.slice(6, 26).map((s) => cardRow(s, byDomain))),
          h('aside', {},
            h('div', { class: 'sec-head' }, h('h2', {}, `${topic.name} Blindspots`)),
            blind.length
              ? blind.slice(0, 4).map((s) => cardBlind(s, byDomain))
              : h('p', { class: 'sec-sub' }, 'No blindspots in this topic right now — coverage is reaching both sides.')
          ))
      : h('div', { class: 'empty-state' }, h('h2', {}, 'Nothing here yet'),
          h('p', {}, 'No stories matched this topic in the last seven days.'))
  );
}

function head(topic, stories, blind) {
  const followBtn = h('button', { class: 'btn-ghost' }, store.following(topic.id) ? 'Unfollow' : 'Follow');
  followBtn.addEventListener('click', () => {
    followBtn.textContent = store.toggleFollow(topic.id) ? 'Unfollow' : 'Follow';
  });
  const outlets = new Set();
  for (const s of stories) for (const d of s.src ?? []) outlets.add(d);
  return h('div', { class: 'page-head' },
    h('h1', {},
      h('span', { class: 'avatar' }, topic.name[0]),
      topic.name,
      h('span', { style: { marginLeft: 'auto' } }, followBtn)),
    h('p', { class: 'intro' },
      `${stories.length} ${topic.name} stor${stories.length === 1 ? 'y' : 'ies'} from ${outlets.size} outlets over the past seven days`,
      blind.length ? `, ${blind.length} of which one side is barely covering.` : '. Coverage is currently reaching both sides.')
  );
}
