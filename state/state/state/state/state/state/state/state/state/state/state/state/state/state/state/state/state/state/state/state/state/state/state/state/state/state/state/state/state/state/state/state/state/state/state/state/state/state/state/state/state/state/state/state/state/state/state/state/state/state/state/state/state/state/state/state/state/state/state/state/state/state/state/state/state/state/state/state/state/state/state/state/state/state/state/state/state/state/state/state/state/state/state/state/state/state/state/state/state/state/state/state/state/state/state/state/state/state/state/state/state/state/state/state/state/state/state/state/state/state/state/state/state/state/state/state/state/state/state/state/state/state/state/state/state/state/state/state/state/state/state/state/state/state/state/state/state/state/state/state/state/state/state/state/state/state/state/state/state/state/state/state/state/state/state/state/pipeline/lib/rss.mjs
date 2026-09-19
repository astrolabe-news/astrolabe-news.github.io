// RSS 2.0 / Atom / RDF parsing, normalized to one article shape.
import { XMLParser } from 'fast-xml-parser';
import { stripHtml, cleanTitle, hash } from './text.mjs';
import { pickImage } from './image.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
  removeNSPrefix: false
});

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v['#text'] ?? '';
  return String(v);
};

export function parseFeed(xml, source, feedUrl = '') {
  // Publishers keep killing their own RSS. Where that happened we fall back to a
  // Google News site: query, which yields headlines but no dek, no image, and a
  // redirect link. Enough to count the outlet's coverage, which is the point.
  const viaGoogle = /(^|\/\/)news\.google\.com/.test(feedUrl);
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  // RSS 2.0, RDF 1.0, and Atom all land in different places.
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF'] ?? doc?.RDF;
  const feed = doc?.feed;
  const rawItems = channel ? arr(channel.item) : feed ? arr(feed.entry) : [];

  const out = [];
  for (const it of rawItems) {
    const article = normalize(it, source, !!feed, viaGoogle);
    if (article) out.push(article);
  }
  return out;
}

function normalize(it, source, isAtom, viaGoogle) {
  let title = cleanTitle(txt(it.title), source.name);
  // Google News appends " - Publisher Name" to every headline.
  if (viaGoogle) title = title.replace(/\s+-\s+[^-]{2,40}$/, '').trim();
  if (!title || title.length < 12) return null;
  if (isJunk(title)) return null;

  const url = extractLink(it, isAtom);
  if (!url) return null;

  const img = viaGoogle ? null : pickImage(it, txt);

  // Google News descriptions are just an anchor tag back to itself.
  const dek = viaGoogle
    ? ''
    : stripHtml(
        txt(it.description) || txt(it.summary) || txt(it['content:encoded']) || txt(it.content)
      ).slice(0, 600);

  return {
    id: hash(`${source.domain}:${canonicalize(url)}`),
    url,
    title,
    dek,
    image: img?.url ?? null,
    imageWidth: img?.width ?? 0,
    viaGoogle,
    publishedAt: parseDate(it, isAtom),
    domain: source.domain,
    source: source.name
  };
}

function extractLink(it, isAtom) {
  if (isAtom) {
    const links = arr(it.link);
    const alt = links.find((l) => l?.['@rel'] === 'alternate' || !l?.['@rel']);
    const href = alt?.['@href'] ?? links[0]?.['@href'] ?? txt(it.link) ?? txt(it.id);
    return clean(href);
  }
  // Some RSS feeds put the real URL only in <guid isPermaLink="true">.
  const link = txt(it.link);
  if (link) return clean(link);
  const guid = it.guid;
  if (guid && (typeof guid === 'string' || guid['@isPermaLink'] !== 'false')) {
    const g = txt(guid);
    if (/^https?:\/\//i.test(g)) return clean(g);
  }
  return null;
}

function clean(href) {
  const h = String(href || '').trim();
  return /^https?:\/\//i.test(h) ? h : null;
}

// Drop tracking params so the same article from two feeds dedupes to one id.
export function canonicalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|ref_|fbclid|gclid|mc_|cmp|smid|partner|taid|s_kwcid)/i.test(k)) {
        u.searchParams.delete(k);
      }
    }
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}${u.search}`.toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function parseDate(it, isAtom) {
  const raw =
    txt(it.pubDate) || txt(it.published) || txt(it.updated) ||
    txt(it['dc:date']) || txt(it.date) || txt(it.issued);
  const t = raw ? Date.parse(raw) : NaN;
  if (!Number.isFinite(t)) return Date.now();
  // A feed claiming the future is a feed with a broken clock. Don't let it pin the top of the page.
  return Math.min(t, Date.now());
}

// Legacy feeds (CNN's old endpoints especially) still emit affiliate and sponsored
// filler alongside real articles.
const JUNK = [
  /\b(0%|APR|cash back|credit card|refinance|mortgage rate)\b/i,
  /\b(sponsored|advertisement|promoted|partner content)\b/i,
  /\bthis is the best\b/i,
  /\b(deal of the day|best deals|save up to|% off)\b/i
];

function isJunk(title) {
  return JUNK.some((re) => re.test(title));
}
