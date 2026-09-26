// Text utilities shared across the pipeline.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…', middot: '·'
};

export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

export function stripHtml(s) {
  if (!s) return '';
  return decodeEntities(
    String(s)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

// Publishers routinely append their own name to headlines. Strip it so clustering
// compares the story, not the masthead.
export function cleanTitle(title, sourceName) {
  let t = stripHtml(title);
  if (sourceName) {
    const esc = sourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\s*[|\\-–—·]\\s*${esc}\\s*$`, 'i'), '');
  }
  return t.replace(/\s+/g, ' ').trim();
}

export function slugify(s, max = 80) {
  const base = stripHtml(s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= max) return base || 'story';
  return base.slice(0, max).replace(/-[^-]*$/, '') || 'story';
}

// FNV-1a. Short, stable, and good enough for content ids.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const STOP = new Set(('a about after all also an and any are as at be because been before but by can could did do does ' +
  'for from get had has have he her him his how i if in into is it its just like make may me more most my new no not ' +
  'now of on one only or other our out over said say says she should so some such than that the their them then there ' +
  'these they this those to two up us use was way we were what when which who will with would you your says say')
  .split(' '));

export function tokens(text) {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// Proper nouns, numbers and other low-frequency terms. These carry the identity of a
// story: "Deloitte", "$21.5", "Maxwell". Used as the clustering guardrail.
export function rareTokens(text) {
  const out = new Set();
  const raw = stripHtml(text);
  for (const m of raw.matchAll(/\b[A-Z][a-zA-Z]{2,}\b/g)) {
    const w = m[0].toLowerCase();
    if (!STOP.has(w)) out.add(w);
  }
  for (const m of raw.matchAll(/\b\d[\d,.]*\b/g)) out.add(m[0].replace(/[,.]$/, ''));
  return out;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

export function sentences(text) {
  return stripHtml(text)
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30);
}

// Overlap coefficient (Szymkiewicz-Simpson). Unlike Jaccard this is insensitive to the
// two sets being wildly different sizes, which matters here: an article carries ~6 rare
// tokens and a mature cluster carries dozens. Under Jaccard a big story becomes
// progressively harder to join, which shatters exactly the stories that matter most.
export function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const x of small) if (large.has(x)) shared++;
  return shared / small.size;
}
