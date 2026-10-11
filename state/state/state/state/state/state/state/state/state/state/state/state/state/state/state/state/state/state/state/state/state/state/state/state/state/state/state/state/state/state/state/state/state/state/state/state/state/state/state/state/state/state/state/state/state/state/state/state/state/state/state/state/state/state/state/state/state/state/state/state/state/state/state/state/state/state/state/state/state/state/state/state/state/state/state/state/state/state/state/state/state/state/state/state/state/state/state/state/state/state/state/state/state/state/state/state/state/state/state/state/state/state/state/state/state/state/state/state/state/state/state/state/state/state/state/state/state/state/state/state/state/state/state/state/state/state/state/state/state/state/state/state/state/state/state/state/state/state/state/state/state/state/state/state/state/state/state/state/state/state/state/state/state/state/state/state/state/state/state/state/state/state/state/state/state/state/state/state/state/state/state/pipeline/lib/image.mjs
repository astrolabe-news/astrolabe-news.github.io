// Article images come straight from the publisher's own CDN, so they cost us nothing
// to serve. This picks the best candidate a feed offers, in descending order of quality.

const BAD = /(spacer|blank|pixel|1x1|transparent|placeholder|logo|avatar|default)/i;
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Returns { url, width } so the story can later choose the largest image any of its
// articles offered. Several publishers ship 60x60 thumbnails, which look like grey
// mush stretched across a 16:9 card.
export function pickImage(item, txt) {
  return (
    fromMedia(item['media:content']) ||
    fromMedia(item['media:thumbnail']) ||
    fromEnclosure(item.enclosure) ||
    fromMedia(item['media:group']?.['media:content']) ||
    fromHtml(txt(item['content:encoded'])) ||
    fromHtml(txt(item.description)) ||
    fromHtml(txt(item.content)) ||
    fromMedia(item.image) ||
    null
  );
}

// Where a feed declares no width, infer one from the URL. Publishers overwhelmingly
// encode the size in the path when the image is a thumbnail.
export function guessWidth(url) {
  const m = String(url).match(/(?:^|[^\d])(\d{2,4})x(\d{2,4})(?:[^\d]|$)/);
  if (m) return Number(m[1]);
  const w = String(url).match(/[?&](?:w|width|resize)=(\d{2,4})/i);
  if (w) return Number(w[1]);
  if (/(thumb|thumbnail|square|_small|-small)/i.test(url)) return 120;
  return 0;
}

function fromMedia(node) {
  // Feeds often carry several sizes. Take the widest one they declare.
  const candidates = arr(node)
    .map((m) => {
      const url = typeof m === 'string' ? m : m?.['@url'] ?? m?.['#text'];
      const declared = Number(typeof m === 'object' ? m?.['@width'] : 0) || 0;
      return {
        url,
        width: declared || guessWidth(url ?? ''),
        type: typeof m === 'object' ? m?.['@type'] ?? m?.['@medium'] ?? '' : ''
      };
    })
    .filter((c) => valid(c.url) && !/video|audio/i.test(c.type))
    .sort((a, b) => b.width - a.width);
  const best = candidates[0];
  return best ? { url: best.url, width: best.width } : null;
}

function fromEnclosure(node) {
  for (const e of arr(node)) {
    const url = typeof e === 'string' ? e : e?.['@url'];
    const type = typeof e === 'object' ? e?.['@type'] ?? '' : '';
    if (valid(url) && (/^image\//i.test(type) || !type)) return { url, width: guessWidth(url) };
  }
  return null;
}

function fromHtml(html) {
  if (!html) return null;
  for (const m of String(html).matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    if (valid(m[1])) return { url: m[1], width: guessWidth(m[1]) };
  }
  return null;
}

function valid(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (BAD.test(url)) return false;
  return /\.(jpe?g|png|webp|avif|gif)(\?|$)/i.test(url) || /(image|img|photo|media|thumb)/i.test(url);
}
