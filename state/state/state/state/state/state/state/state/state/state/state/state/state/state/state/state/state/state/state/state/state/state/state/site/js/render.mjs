// A hyperscript small enough to read in one sitting. No framework, no build step.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) { if (dv != null) el.dataset[dk] = dv; }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, children);
  return el;
}

function add(el, kids) {
  for (const c of kids.flat(4)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const frag = (...kids) => { const f = document.createDocumentFragment(); add(f, kids); return f; };
export const mount = (sel, ...kids) => {
  const host = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!host) return null;
  host.replaceChildren();
  add(host, kids);
  return host;
};

export function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} minute${Math.round(m) === 1 ? '' : 's'} ago`;
  const hr = m / 60;
  if (hr < 24) return `${Math.round(hr)} hour${Math.round(hr) === 1 ? '' : 's'} ago`;
  const d = Math.round(hr / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const shortAgo = (ts) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

export const icon = (d, size = 16) =>
  h('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    h('path', { d }));

export const ICONS = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  trend: 'M23 6l-9.5 9.5-5-5L1 18',
  chevron: 'M6 9l6 6 6-6',
  external: 'M7 17L17 7M7 7h10v10'
};
