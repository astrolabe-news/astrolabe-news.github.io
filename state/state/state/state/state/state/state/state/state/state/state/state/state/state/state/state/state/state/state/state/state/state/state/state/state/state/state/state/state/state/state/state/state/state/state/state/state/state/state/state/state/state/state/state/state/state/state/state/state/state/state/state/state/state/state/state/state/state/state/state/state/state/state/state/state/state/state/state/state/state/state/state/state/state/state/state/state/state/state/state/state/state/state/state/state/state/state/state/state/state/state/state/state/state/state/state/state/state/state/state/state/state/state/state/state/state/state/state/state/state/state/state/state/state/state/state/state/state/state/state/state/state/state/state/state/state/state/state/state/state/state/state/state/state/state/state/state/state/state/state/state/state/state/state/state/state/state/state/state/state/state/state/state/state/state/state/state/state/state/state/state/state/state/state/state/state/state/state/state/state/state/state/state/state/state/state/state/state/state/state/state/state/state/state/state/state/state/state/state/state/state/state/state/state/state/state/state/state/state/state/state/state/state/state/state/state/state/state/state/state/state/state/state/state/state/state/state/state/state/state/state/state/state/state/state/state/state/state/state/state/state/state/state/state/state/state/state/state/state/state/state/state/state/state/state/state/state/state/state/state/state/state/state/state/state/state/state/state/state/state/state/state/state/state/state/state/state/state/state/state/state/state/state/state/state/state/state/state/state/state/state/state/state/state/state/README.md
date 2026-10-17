# Astrolabe

Know who is covering a story, and who is not.

Astrolabe groups news articles into stories and shows the political spread of the outlets
covering each one, plus **Umbra**, a feed of politically-charged stories one side has left in shadow. It is free to use, has no accounts, and runs with no server and no hosting bill.

## How it costs nothing

| Piece | How |
|---|---|
| Compute | GitHub Actions, which is unlimited-free on public repositories |
| Clustering | `all-MiniLM-L6-v2` as ONNX on the runner's CPU — no inference API |
| Article images | Hotlinked from the publishers' own CDNs |
| Publisher logos | Public favicon services, with an initials disc as fallback |
| Hosting | GitHub Pages |
| Summaries | Extractive by default. Gemini's free tier optionally, budgeted and cached |
| Accounts | None. Follows, location and reading history live in `localStorage` |

The half-hourly refresh is only free because the repository is public. On a private repo
this burns the 2,000-minute monthly allowance in about a fortnight.

## Running it

```bash
npm install
node pipeline/run.mjs --no-llm     # full pipeline, no API key needed
npm run serve                      # http://localhost:8080
```

Useful flags: `--limit N` caps articles, `--no-llm` forces extractive summaries,
`--budget N` caps Gemini calls, `--dry` skips all writes.

```bash
node pipeline/validate.mjs              # check the registry and topic rules
node pipeline/eval.mjs                  # inspect cluster quality; how thresholds get tuned
node pipeline/discover.mjs --recheck    # find feeds that have gone dead
node pipeline/discover.mjs cands.json   # find feeds for new outlets, ready to paste in
```

Adding outlets is the main lever on quality: more outlets means more stories reach the
coverage depth where a bias split means anything. Going from 120 to 268 outlets took the
stories with 8+ distinct outlets from 39 to 93.

## Deploying

1. Push to a **public** GitHub repo.
2. Settings → Pages → Source: **GitHub Actions**.
3. Optionally add a `GEMINI_API_KEY` secret for written summaries. Without it everything
   still works, using extractive summaries.
4. Run the **Ingest and deploy** workflow once by hand, then leave the cron to it.

Generated data is never committed. The workflow builds `site/` fresh and hands it to Pages
as an artifact. Only cluster state persists, force-pushed as a single orphan commit on a
`state` branch, so the repository stays a couple of megabytes indefinitely.

## How it works

**Grouping.** Every 30 minutes the pipeline reads ~277 feeds from 268 outlets. Headlines are embedded
locally, and an article joins an existing story when it clears both a cosine similarity
threshold *and* a rare-token overlap test — shared names, places and numbers. Similarity
alone will happily fuse two unrelated tariff stories; the second test is what stops it.

The overlap test uses the *overlap coefficient*, not Jaccard. Jaccard punishes size
mismatch, so a story with 60 accumulated tokens becomes progressively harder for a
6-token article to join — which shatters exactly the biggest stories.

**Ratings.** `pipeline/sources.json` is hand-curated. Bias, factuality and ownership are
derived from publicly published assessments by AllSides and Media Bias/Fact Check, and
every row records which of them informed it. They apply to outlets, not to articles.

Keep the spectrum balanced. `validate.mjs` fails the build if the left and right counts
drift more than 25% apart, because a skewed registry makes every story look like a
blindspot for the lighter side.

**Blindspots.** The test is *relative to each side's own baseline*, not a fixed
percentage. Across the corpus the average story is carried by ~31% left-leaning and ~20%
right-leaning outlets, because the two sides do not publish at the same rate. A story is
flagged when one side runs it at under half its usual rate while the other runs it at or
above theirs, plus absolute floors: six or more rated outlets, fewer than ten on the blind
side, that side at 22% or less, no more than 35% poorly-rated coverage, and a political
primary topic.

A fixed threshold looks fairer and is not. With one 20% cutoff for both sides, a 20%-left
story sits at 0.65x the left's normal participation while a 20%-right story sits at 0.91x
the right's — so the same number is a much harder test for one side, and the feed fills
with right blindspots regardless of what is happening. That bug produced a 1-left/5-right
feed on a balanced registry.

## What it does badly

- 268 outlets, limited to those with working public feeds. Several major publishers killed
  their RSS; those are reached through a Google News headline index instead, so they
  contribute a headline with no image or blurb. Around a third of the registry is in that
  state — `pipeline/discover.mjs --recheck` reports which.
- Summaries are built from headlines and short feed blurbs, not full articles.
- Local news is thin — a story is placed somewhere only when its headlines name the place.
- Clustering still splits and merges wrongly sometimes. `eval.mjs` exists for exactly this.
- Stories are kept seven days, then dropped.

## Credit

Astrolabe is an independent implementation of an idea [Ground News](https://ground.news)
developed and popularised: showing the political spread of coverage on every story, and
surfacing what one side is ignoring.

Astrolabe is **not affiliated with, endorsed by, or connected to Ground News**, and shares
none of their code, branding, copy or data. The methodology here was derived from their
publicly documented approach and then rebuilt independently; the naming, palette, wording
and thresholds are its own.

Headlines, images and links belong to the publishers who produced them, and every article
links back to the original.

Product naming lives in one file, `site/js/brand.mjs`. Change it there and it changes
everywhere.
