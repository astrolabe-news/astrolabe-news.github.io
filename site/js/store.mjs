// Data access plus the only "account" this product has: localStorage.
const cache = new Map();

export async function load(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`data/${path}`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.json();
  });
  cache.set(path, p);
  return p;
}

export const home = () => load('home.json');
export const index = () => load('index.json');
export const meta = () => load('meta.json');
export const sources = () => load('sources.json').then((d) => d.sources);
export const story = (id) => load(`story/${id}.json`);

export async function sourceMap() {
  const list = await sources();
  return new Map(list.map((s) => [s.domain, s]));
}

/* ---------- local state ---------- */
const KEY = 'fulcrum:v1';
const blank = { follows: [], history: [], place: null, theme: 'auto' };

export function state() {
  try { return { ...blank, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...blank }; }
}

export function save(patch) {
  const next = { ...state(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

export const following = (id) => state().follows.includes(id);

export function toggleFollow(id) {
  const s = state();
  const follows = s.follows.includes(id) ? s.follows.filter((x) => x !== id) : [...s.follows, id];
  save({ follows });
  return follows.includes(id);
}

// Reading history is what My News Bias is computed from. It never leaves the browser.
export function recordRead(story) {
  const s = state();
  const entry = {
    id: story.id, t: story.title, at: Date.now(),
    p: [story.coverage.pct.left, story.coverage.pct.center, story.coverage.pct.right],
    src: story.articles.slice(0, 12).map((a) => [a.domain, a.bias])
  };
  const history = [entry, ...s.history.filter((x) => x.id !== story.id)].slice(0, 500);
  save({ history });
}

/* ---------- theme ---------- */
export function applyTheme(theme) {
  const t = theme ?? state().theme ?? 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  return t;
}
