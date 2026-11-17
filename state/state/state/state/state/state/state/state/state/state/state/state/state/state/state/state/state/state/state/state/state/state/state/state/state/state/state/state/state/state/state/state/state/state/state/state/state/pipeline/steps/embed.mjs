// Sentence embeddings, computed locally. all-MiniLM-L6-v2 as ONNX on CPU costs nothing
// to run, which is the whole reason clustering is affordable here.
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const BATCH = 64;

let extractor = null;

export async function getExtractor(log = console.log) {
  if (!extractor) {
    log(`  loading ${MODEL}`);
    extractor = await pipeline('feature-extraction', MODEL, { dtype: 'fp32' });
  }
  return extractor;
}

// A story's identity lives in its headline; the dek is supporting detail, and roughly
// a fifth of our articles have no dek at all.
export function embedText(article) {
  const dek = (article.dek || '').slice(0, 300);
  return dek ? `${article.title}. ${dek}` : article.title;
}

export async function embedAll(articles, { log = console.log } = {}) {
  if (!articles.length) return [];
  const model = await getExtractor(log);
  const out = new Array(articles.length);

  for (let i = 0; i < articles.length; i += BATCH) {
    const chunk = articles.slice(i, i + BATCH);
    const res = await model(chunk.map(embedText), { pooling: 'mean', normalize: true });
    const dims = res.dims[1];
    const flat = res.data;
    for (let j = 0; j < chunk.length; j++) {
      out[i + j] = Float32Array.from(flat.subarray(j * dims, (j + 1) * dims));
    }
    if ((i / BATCH) % 5 === 0) log(`  embedded ${Math.min(i + BATCH, articles.length)}/${articles.length}`);
  }
  return out;
}

export function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are pre-normalized
}

// Centroids are stored between runs. Full float32 would be ~3MB of state; int8 costs
// a negligible amount of precision and keeps the state file small enough to commit.
export function quantize(vec) {
  const buf = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    buf[i] = Math.max(-127, Math.min(127, Math.round(vec[i] * 127)));
  }
  return Buffer.from(buf.buffer).toString('base64');
}

export function dequantize(b64) {
  const raw = Buffer.from(b64, 'base64');
  const int8 = new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  const out = new Float32Array(int8.length);
  let norm = 0;
  for (let i = 0; i < int8.length; i++) {
    out[i] = int8[i] / 127;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
