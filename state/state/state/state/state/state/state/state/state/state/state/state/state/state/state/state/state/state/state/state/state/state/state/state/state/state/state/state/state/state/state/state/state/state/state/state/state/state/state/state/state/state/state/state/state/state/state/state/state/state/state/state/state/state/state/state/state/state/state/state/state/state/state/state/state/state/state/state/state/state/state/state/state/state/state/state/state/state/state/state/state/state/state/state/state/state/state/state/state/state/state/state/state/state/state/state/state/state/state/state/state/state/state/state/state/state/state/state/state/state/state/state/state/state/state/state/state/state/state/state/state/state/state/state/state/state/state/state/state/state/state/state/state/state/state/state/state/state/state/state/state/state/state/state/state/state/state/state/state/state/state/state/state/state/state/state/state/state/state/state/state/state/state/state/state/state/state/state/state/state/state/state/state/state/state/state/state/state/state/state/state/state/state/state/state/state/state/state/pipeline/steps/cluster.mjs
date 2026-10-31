// Incremental online clustering. Runs every 30 minutes, so it must never re-cluster the
// world: existing clusters and their centroids are loaded from state, new articles are
// assigned against them, and story ids stay stable because they are permalinks.
import { cosine, quantize, dequantize } from './embed.mjs';
import { rareTokens, overlap, slugify, hash } from '../lib/text.mjs';

export const DEFAULTS = {
  joinThreshold: 0.62,   // cosine at which an article joins an existing story
  mergeThreshold: 0.72,  // cosine at which two stories are the same story
  rareOverlap: 0.30,     // overlap-coefficient floor on rare tokens; the false-merge guardrail
  windowHours: 72,       // how long a story stays open to new coverage
  retentionDays: 7       // how long a story stays in state at all
};

export function loadState(raw) {
  if (!raw) return { version: 1, updatedAt: 0, clusters: [] };
  const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  for (const c of s.clusters) {
    c.vec = dequantize(c.centroid);
    c.rare = new Map(c.rare);
    c.core = coreRare(c);
  }
  return s;
}

export function serializeState(state) {
  return {
    version: 1,
    updatedAt: Date.now(),
    clusters: state.clusters.map((c) => ({
      id: c.id,
      slug: c.slug,
      centroid: quantize(c.vec),
      createdAt: c.createdAt,
      lastAt: c.lastAt,
      rare: [...c.rare].sort((a, b) => b[1] - a[1]).slice(0, 80),
      articles: c.articles
    }))
  };
}

export function cluster(articles, vectors, state, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = Date.now();
  const windowMs = o.windowHours * 3600e3;

  const known = new Set();
  for (const c of state.clusters) for (const a of c.articles) known.add(a.id);

  // An inverted index over rare tokens. Comparing every article against every open
  // cluster is O(n*m) and far too slow; the guardrail already requires a shared rare
  // token, so only clusters sharing one are worth scoring at all.
  const index = new Map();
  const addToIndex = (idx, rare) => {
    for (const t of rare.keys ? rare.keys() : rare) {
      let bucket = index.get(t);
      if (!bucket) index.set(t, (bucket = new Set()));
      bucket.add(idx);
    }
  };
  state.clusters.forEach((c, i) => {
    if (now - c.lastAt <= windowMs) addToIndex(i, c.rare);
  });

  const stats = { seen: 0, joined: 0, created: 0, merged: 0 };

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    if (known.has(article.id)) { stats.seen++; continue; }
    known.add(article.id);

    const vec = vectors[i];
    const rare = rareTokens(`${article.title} ${article.dek || ''}`);

    let best = -1;
    let bestScore = 0;
    const candidates = new Set();
    for (const t of rare) {
      const bucket = index.get(t);
      if (bucket) for (const idx of bucket) candidates.add(idx);
    }

    for (const idx of candidates) {
      const c = state.clusters[idx];
      if (now - c.lastAt > windowMs) continue;
      const sim = cosine(vec, c.vec);
      if (sim < o.joinThreshold) continue;
      // Embeddings alone will happily fuse two different tariff stories. Requiring
      // shared proper nouns and numbers is what stops that. Compared against the
      // cluster's core vocabulary, not every token it has ever seen.
      if (overlap(rare, c.core) < o.rareOverlap) continue;
      if (sim > bestScore) { bestScore = sim; best = idx; }
    }

    if (best >= 0) {
      absorb(state.clusters[best], article, vec, rare);
      addToIndex(best, rare);
      stats.joined++;
    } else {
      const c = createCluster(article, vec, rare);
      state.clusters.push(c);
      addToIndex(state.clusters.length - 1, rare);
      stats.created++;
    }
  }

  stats.merged = mergePass(state, o, now, windowMs);
  return stats;
}

function createCluster(article, vec, rare) {
  return {
    id: hash(`${article.id}:${article.publishedAt}`),
    slug: slugify(article.title),
    vec: Float32Array.from(vec),
    createdAt: article.publishedAt,
    lastAt: article.publishedAt,
    rare: new Map([...rare].map((t) => [t, 1])),
    core: new Set(rare),
    articles: [article]
  };
}

// A story's core vocabulary is the words its coverage keeps repeating. One outlet
// mentioning "Broadway" once should not become part of the story's identity.
function coreRare(c) {
  const n = c.articles.length;
  if (n <= 2) return new Set(c.rare.keys());
  const min = n >= 8 ? 3 : 2;
  const core = new Set();
  for (const [t, count] of c.rare) if (count >= min) core.add(t);
  // Never let the core empty out; fall back to the most frequent terms.
  if (core.size < 3) {
    for (const [t] of [...c.rare].sort((a, b) => b[1] - a[1]).slice(0, 6)) core.add(t);
  }
  return core;
}

function absorb(c, article, vec, rare) {
  c.articles.push(article);
  const n = c.articles.length;
  // Running mean, renormalized so cosine stays a dot product.
  let norm = 0;
  for (let d = 0; d < c.vec.length; d++) {
    c.vec[d] += (vec[d] - c.vec[d]) / n;
    norm += c.vec[d] * c.vec[d];
  }
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < c.vec.length; d++) c.vec[d] /= norm;

  for (const t of rare) c.rare.set(t, (c.rare.get(t) ?? 0) + 1);
  c.core = coreRare(c);
  if (article.publishedAt > c.lastAt) c.lastAt = article.publishedAt;
  if (article.publishedAt < c.createdAt) c.createdAt = article.publishedAt;
}

// Two outlets breaking the same story minutes apart seed two clusters. This folds them
// back together. The older cluster always wins, so its permalink survives.
function mergePass(state, o, now, windowMs) {
  const open = [];
  state.clusters.forEach((c, i) => { if (now - c.lastAt <= windowMs) open.push(i); });

  const absorbedBy = new Map();
  for (let a = 0; a < open.length; a++) {
    for (let b = a + 1; b < open.length; b++) {
      let x = open[a], y = open[b];
      if (absorbedBy.has(x) || absorbedBy.has(y)) continue;
      const cx = state.clusters[x], cy = state.clusters[y];
      if (cosine(cx.vec, cy.vec) < o.mergeThreshold) continue;
      if (overlap(cx.core, cy.core) < o.rareOverlap) continue;
      // Older survives; its id is already published.
      const [keep, drop] = cx.createdAt <= cy.createdAt ? [cx, cy] : [cy, cx];
      const dropIdx = keep === cx ? y : x;
      const seen = new Set(keep.articles.map((a2) => a2.id));
      for (const art of drop.articles) if (!seen.has(art.id)) keep.articles.push(art);
      for (const [t, n] of drop.rare) keep.rare.set(t, (keep.rare.get(t) ?? 0) + n);
      keep.core = coreRare(keep);
      keep.lastAt = Math.max(keep.lastAt, drop.lastAt);
      keep.createdAt = Math.min(keep.createdAt, drop.createdAt);
      keep.aliases = [...(keep.aliases || []), drop.id, ...(drop.aliases || [])];
      absorbedBy.set(dropIdx, keep.id);
    }
  }

  if (absorbedBy.size) {
    state.clusters = state.clusters.filter((_, i) => !absorbedBy.has(i));
  }
  return absorbedBy.size;
}

export function prune(state, retentionDays = DEFAULTS.retentionDays) {
  const cutoff = Date.now() - retentionDays * 864e5;
  const before = state.clusters.length;
  state.clusters = state.clusters.filter((c) => c.lastAt >= cutoff);
  for (const c of state.clusters) {
    c.articles.sort((a, b) => b.publishedAt - a.publishedAt);
    if (c.articles.length > 300) c.articles.length = 300;
  }
  return before - state.clusters.length;
}
