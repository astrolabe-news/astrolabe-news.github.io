// Turns a raw cluster into a story: who covered it, where they sit on the spectrum,
// whether one side is ignoring it, how factual the coverage is, and who owns it.

import { rareTokens, jaccard } from '../lib/text.mjs';

export const BIAS_ORDER = ['far-left', 'left', 'lean-left', 'center', 'lean-right', 'right', 'far-right'];
export const BIAS_LABEL = {
  'far-left': 'Far Left', left: 'Left', 'lean-left': 'Lean Left', center: 'Center',
  'lean-right': 'Lean Right', right: 'Right', 'far-right': 'Far Right', unrated: 'Unrated'
};
const SIDE = {
  'far-left': 'left', left: 'left', 'lean-left': 'left',
  center: 'center',
  'lean-right': 'right', right: 'right', 'far-right': 'right'
};
const FACT_SCORE = { 'very-low': 0, low: 1, mixed: 2, high: 3, 'very-high': 4 };
const FACT_LABEL = ['Very Low', 'Low', 'Mixed', 'High', 'Very High'];
const LOW_FACTUALITY = new Set(['very-low', 'low']);

// A side is blind to a story when it covers it far less than that side normally covers
// anything - not when it falls below some fixed percentage.
//
// This matters more than it sounds. Across our corpus the average story is carried by
// ~31% left-leaning and ~22% right-leaning outlets, because right-leaning outlets in the
// registry simply publish less. Against a flat 20% threshold, a 20%-left story is at 0.65x
// the left's normal participation while a 20%-right story is at 0.91x the right's - so the
// same number is a much harder test for one side than the other, and the feed fills up
// with right blindspots regardless of what is actually happening.
//
// Measuring each side against its own baseline removes that, and keeps working as the
// registry changes.
const BLINDSPOT = {
  maxSideSources: 10,      // absolute floor: almost nobody on that side ran it
  maxSideShare: 0.22,      // hard ceiling, so the label never reads "Only 40% Left"
  relativeToBaseline: 0.5, // and under half that side's normal participation
  minOtherRatio: 1.0,      // while the other side is at or above its own normal
  minTotal: 6,
  maxLowFactuality: 0.35
};

export function buildStory(cluster, byDomain, taxonomy) {
  // One outlet running five follow-ups is still one source. Coverage is counted by outlet.
  const outlets = new Map();
  for (const a of cluster.articles) {
    const existing = outlets.get(a.domain);
    if (!existing || a.publishedAt < existing.publishedAt) outlets.set(a.domain, a);
  }

  const sources = [...outlets.keys()].map((d) => byDomain.get(d)).filter(Boolean);
  const buckets = Object.fromEntries(BIAS_ORDER.map((b) => [b, []]));
  const untracked = [];

  for (const s of sources) {
    if (buckets[s.bias]) buckets[s.bias].push(s.domain);
    else untracked.push(s.domain);
  }

  const sides = { left: 0, center: 0, right: 0 };
  for (const s of sources) {
    const side = SIDE[s.bias];
    if (side) sides[side]++;
  }
  const rated = sides.left + sides.center + sides.right;
  const pct = {
    left: rated ? Math.round((sides.left / rated) * 100) : 0,
    center: rated ? Math.round((sides.center / rated) * 100) : 0,
    right: rated ? Math.round((sides.right / rated) * 100) : 0
  };
  // Rounding three numbers independently rarely lands on 100.
  const drift = 100 - (pct.left + pct.center + pct.right);
  if (drift && rated) {
    const biggest = ['left', 'center', 'right'].sort((a, b) => pct[b] - pct[a])[0];
    pct[biggest] += drift;
  }

  const lead = pickLead(cluster.articles, byDomain, cluster.core ?? new Set());
  const topics = assignTopics(cluster, taxonomy);
  const first = cluster.articles.reduce((m, a) => (a.publishedAt < m.publishedAt ? a : m), cluster.articles[0]);

  return {
    id: cluster.id,
    slug: cluster.slug,
    aliases: cluster.aliases ?? [],
    title: lead.title,
    dek: lead.dek || '',
    image: bestImage(cluster.articles),
    publishedAt: cluster.createdAt,
    updatedAt: cluster.lastAt,
    topics,
    place: assignPlace(cluster, sources, taxonomy),
    coverage: {
      total: sources.length,
      articles: cluster.articles.length,
      sides,
      pct,
      buckets: Object.fromEntries(BIAS_ORDER.map((b) => [b, buckets[b]])),
      untracked
    },
    // Filled in by applyBlindspots once the whole corpus is known.
    blindspot: null,
    _blind: { sides, rated, lowShare: lowFactualityShare(sources), political: isPolitical(topics, taxonomy) },
    factuality: aggregateFactuality(sources),
    ownership: aggregateOwnership(sources),
    brokeFirst: { domain: first.domain, source: first.source, publishedAt: first.publishedAt },
    articles: cluster.articles.map((a) => {
      const s = byDomain.get(a.domain);
      return {
        id: a.id, url: a.url, title: a.title, dek: a.dek,
        image: a.image ?? null, publishedAt: a.publishedAt,
        domain: a.domain, source: a.source,
        bias: s?.bias ?? 'unrated',
        side: SIDE[s?.bias] ?? null,
        factuality: s?.factuality ?? null,
        ownership: s?.ownership ?? null,
        place: [s?.city, s?.country].filter(Boolean).join(', ')
      };
    }).sort((a, b) => b.publishedAt - a.publishedAt)
  };
}

// Across a cluster of twenty articles, at least one publisher usually shipped a
// full-size photo. Take theirs rather than whichever happened to be first.
function bestImage(articles) {
  const withImage = articles.filter((a) => a.image);
  if (!withImage.length) return null;
  return withImage.sort((a, b) => (b.imageWidth || 0) - (a.imageWidth || 0))[0].image;
}

// The headline shown for a story should come from a well-rated outlet near the centre,
// and should carry a dek and image where possible - not just whoever published first.
function pickLead(articles, byDomain, clusterRare) {
  return [...articles].sort((a, b) => score(b) - score(a))[0];

  function score(a) {
    const s = byDomain.get(a.domain);
    let n = 0;
    if (a.dek) n += 3;
    if (a.image) n += 2;
    if (s) {
      n += (FACT_SCORE[s.factuality] ?? 2);
      if (s.bias === 'center') n += 3;
      else if (s.bias === 'lean-left' || s.bias === 'lean-right') n += 1;
    }
    if (/\|/.test(a.title)) n -= 2;          // broadcast-segment titles
    if (/^live/i.test(a.title)) n -= 3;      // live blogs
    // Broadcast segments and press roundups are not the story's headline.
    if (/^(watch|video|photos?|listen|recap|news wrap|the papers|morning brief|podcast|transcript)\b\s*:?/i.test(a.title)) n -= 6;
    if (a.viaGoogle) n -= 2;                 // no dek, no image
    // Prefer a headline that states the news over one that frames it: commentary,
    // explainers and reaction pieces make poor story titles.
    if (/\b(explains?|explainer|analysis|opinion|why |how |what to know|reacts?|tributes?|remembered|essential|live updates)\b/i.test(a.title)) n -= 4;
    if (a.title.includes('?')) n -= 2;
    // And prefer one carrying the vocabulary the whole press pack is using.
    if (clusterRare?.size) n += jaccard(rareTokens(a.title), clusterRare) * 12;
    return n;
  }
}

// Two-pass: a story cannot know whether its coverage is unusual until every story is
// built and the corpus baseline is known.
export function applyBlindspots(stories, opts = {}) {
  const o = { ...BLINDSPOT, ...opts };
  const eligible = stories.filter((s) => s._blind.rated >= o.minTotal);

  const baseline = { left: 0, center: 0, right: 0 };
  if (eligible.length) {
    for (const s of eligible) {
      baseline.left += s.coverage.pct.left;
      baseline.center += s.coverage.pct.center;
      baseline.right += s.coverage.pct.right;
    }
    for (const k of ['left', 'center', 'right']) baseline[k] = baseline[k] / eligible.length / 100;
  }

  for (const s of stories) {
    s.blindspot = detect(s, baseline, o);
    delete s._blind;
  }
  return {
    baseline: {
      left: Math.round(baseline.left * 100),
      center: Math.round(baseline.center * 100),
      right: Math.round(baseline.right * 100)
    },
    eligible: eligible.length
  };
}

function detect(story, baseline, o) {
  const { sides, rated, lowShare, political } = story._blind;
  if (rated < o.minTotal) return null;
  if (lowShare > o.maxLowFactuality) return null;
  if (!political) return null;

  const share = { left: sides.left / rated, right: sides.right / rated };

  for (const [side, other] of [['left', 'right'], ['right', 'left']]) {
    const base = baseline[side] || 0.01;
    const otherBase = baseline[other] || 0.01;
    if (sides[side] >= o.maxSideSources) continue;
    if (share[side] > o.maxSideShare) continue;
    if (share[side] / base > o.relativeToBaseline) continue;
    if (share[other] / otherBase < o.minOtherRatio) continue;
    const pct = Math.round(share[side] * 100);
    const label = side === 'left' ? 'Left' : 'Right';
    return {
      side,
      share: pct,
      label: pct === 0 ? `0% ${label}` : `Only ${pct}% ${label}`,
      // How far below normal, for the story page to state plainly.
      versusNormal: Math.round((share[side] / base) * 100)
    };
  }
  return null;
}

const LOW = LOW_FACTUALITY;
function lowFactualityShare(sources) {
  return sources.filter((s) => LOW.has(s.factuality)).length / (sources.length || 1);
}

function isPolitical(topics, taxonomy) {
  const political = new Set(taxonomy.topics.filter((t) => t.political).map((t) => t.id));
  return topics.length > 0 && political.has(topics[0].id);
}

function aggregateFactuality(sources) {
  const rated = sources.filter((s) => s.factuality in FACT_SCORE);
  if (!rated.length) return null;
  const counts = { 'very-low': 0, low: 0, mixed: 0, high: 0, 'very-high': 0 };
  let sum = 0;
  for (const s of rated) { counts[s.factuality]++; sum += FACT_SCORE[s.factuality]; }
  const avg = sum / rated.length;
  return {
    average: Math.round(avg * 100) / 100,
    label: FACT_LABEL[Math.round(avg)],
    counts,
    segments: Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([tier, n]) => ({ tier, pct: Math.round((n / rated.length) * 100) }))
  };
}

function aggregateOwnership(sources) {
  const counts = {};
  for (const s of sources) if (s.ownership) counts[s.ownership] = (counts[s.ownership] ?? 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return {
    total,
    entries: Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => ({ type, count: n, pct: Math.round((n / total) * 100) }))
  };
}

// Scored by the share of the cluster's headlines that mention the topic, not by how
// many patterns match somewhere in the pile. Trump ordering flags lowered for Dolly
// Parton should not make her death a Donald Trump story.
function assignTopics(cluster, taxonomy) {
  const headlines = cluster.articles.map((a) => ` ${a.title.toLowerCase()} `);
  const hits = [];
  for (const t of taxonomy.topics) {
    const pats = t.any.map((p) => p.toLowerCase());
    let docs = 0;
    for (const hl of headlines) if (pats.some((p) => hl.includes(p))) docs++;
    if (!docs) continue;
    const share = docs / headlines.length;
    // A topic mentioned in a handful of a large story's headlines is incidental.
    if (headlines.length >= 5 && share < 0.25) continue;
    hits.push({ id: t.id, name: t.name, score: share * t.weight });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 3).map(({ id, name }) => ({ id, name }));
}

function assignPlace(cluster, sources, taxonomy) {
  const titles = cluster.articles.map((a) => a.title);
  const n = titles.length;
  // Same reasoning as topics: one outlet naming a state does not locate the story there.
  const minDocs = n >= 8 ? Math.ceil(n * 0.2) : 1;
  const count = (needle) => {
    const re = new RegExp(`\\b${needle.replace('.', '\\.')}\\b`);
    return titles.reduce((acc, t) => acc + (re.test(t) ? 1 : 0), 0);
  };

  let best = null;
  for (const state of taxonomy.places.states) {
    const c = count(state);
    if (c >= minDocs && (!best || c > best.c)) best = { name: state, country: 'United States', c };
  }
  for (const city of taxonomy.places.cities) {
    const c = count(city);
    if (c >= minDocs && (!best || c > best.c)) best = { name: city, country: null, c };
  }
  if (best) return { name: best.name, country: best.country };
  // No place in the headline: fall back to where most of the covering outlets are.
  const countries = {};
  for (const s of sources) if (s.country) countries[s.country] = (countries[s.country] ?? 0) + 1;
  const top = Object.entries(countries).sort((a, b) => b[1] - a[1])[0];
  return top ? { name: top[0], country: top[0] } : null;
}
