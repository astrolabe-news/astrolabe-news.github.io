// Methodology, written plainly, including what this does badly.
import { h, mount } from './render.mjs';
import * as store from './store.mjs';
import { chrome, footer } from './components/chrome.mjs';

const meta = await store.meta();
store.applyTheme();
mount('#chrome', chrome({ topics: meta.topics.slice(0, 12) }));
mount('#foot', footer(meta));

const p = (...kids) => h('p', { style: { margin: '0 0 14px', lineHeight: '1.65' } }, ...kids);
const sec = (id, title, ...kids) => h('section', { id, style: { margin: '0 0 40px', scrollMarginTop: '20px' } },
  h('h2', { style: { fontSize: '22px', marginBottom: '12px' } }, title), ...kids);

mount('#app',
  h('div', { class: 'page-head' },
    h('h1', {}, 'How Fulcrum works'),
    h('p', { class: 'intro' }, 'Fulcrum groups news articles into stories and shows you the political spread of the outlets covering each one. It is free, has no accounts, and runs without a server.')),
  h('div', { style: { maxWidth: '680px', paddingTop: '22px' } },
    sec('stories', 'Grouping articles into stories',
      p(`Every half hour Fulcrum reads the public RSS feeds of ${meta.outlets} news outlets. Each headline is turned into a numeric fingerprint by a small language model that runs locally, and articles with similar fingerprints are grouped into one story.`),
      p('Similarity alone is not enough. Two separate tariff stories can look almost identical to a model, so an article only joins a story if it also shares specific words with it — names, places, numbers. Both tests have to pass.'),
      p('It still gets things wrong. Occasionally a story splits in two, or an unrelated article lands in a group. If a story looks wrong, the article list underneath shows exactly what was grouped.')),
    sec('bias', 'Where the ratings come from',
      p('Bias, factuality and ownership ratings are attached to outlets, not to articles. They are derived from assessments published by AllSides and Media Bias/Fact Check, two organisations that rate news sources. Every outlet lists which of them informed its rating on the ',
        h('a', { href: 'sources.html', style: { textDecoration: 'underline' } }, 'source ratings page'), '.'),
      p('This matters: a rating describes an outlet\'s overall record, not the article in front of you. A left-rated outlet can publish a straight news report, and a highly-rated one can publish a bad piece.'),
      p(`Fulcrum currently reads ${meta.outlets} outlets. The real number of news sources in the world is far larger, so a story here showing "40 sources" means 40 of the outlets Fulcrum happens to read.`)),
    sec('blindspot', 'What makes a story a Blindspot',
      p('A Blindspot is a politically-charged story that one side of the spectrum is barely covering while the other side covers it properly.'),
      p('A story qualifies when fewer than ten outlets on one side ran it, those outlets make up 20% or less of the coverage, the other side makes up more than a third, at least eight rated outlets covered it in total, and no more than 35% of the coverage comes from outlets with poor factuality records.'),
      p('The story\'s main topic also has to be political. A celebrity death covered unevenly is uneven coverage, not a blindspot.')),
    sec('summaries', 'How summaries are written',
      p('Every story gets a summary built by picking the sentences that the coverage independently agrees on — no AI, no API, no cost. Where a summary was instead written by a language model, the story page says so directly underneath it.'),
      p('Summaries are built from headlines and the short blurbs feeds provide, not from full articles. They are a starting point for deciding what to read, not a replacement for reading it.')),
    sec('data', 'What is stored about you',
      p('Nothing, anywhere. There are no accounts and no analytics. Your reading history, followed topics and chosen location live in your browser\'s local storage, which is what the ',
        h('a', { href: 'my-bias.html', style: { textDecoration: 'underline' } }, 'My News Bias'), ' page reads. Clearing your browser data clears it.')),
    sec('limits', 'What this does badly',
      h('ul', { style: { lineHeight: '1.7', paddingLeft: '20px' } },
        h('li', {}, `Coverage is limited to ${meta.outlets} outlets with working public feeds. Several major publishers no longer offer usable RSS, and a few are reached only through a headline index, so they contribute a headline with no image or blurb.`),
        h('li', {}, 'Local news is thin. A story is placed somewhere when its headlines name that place, so smaller towns will usually be empty.'),
        h('li', {}, 'Ratings are somebody else\'s judgement, applied at outlet level, and reasonable people disagree with plenty of them.'),
        h('li', {}, 'Stories are kept for seven days, then dropped.'),
        h('li', {}, 'The feed refreshes every half hour, not continuously.'))),
    sec('credit', 'Credit where it is due',
      p('Fulcrum is an independent rebuild of an idea Ground News developed and popularised: showing the political spread of coverage on every story, and surfacing the stories one side is ignoring. It is not affiliated with them.'),
      p('Headlines, images and links belong to the publishers who produced them. Every article links back to the original.'))
  )
);
