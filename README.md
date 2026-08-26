# Fulcrum

See who is covering a story, and who is not.

Fulcrum groups news articles into stories and shows the political spread of the outlets
covering each one, plus a feed of politically-charged stories that one side is barely
reporting. It is free to use, has no accounts, and runs with no server and no hosting bill.

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
node pipeline/validate.mjs   # check the source registry and topic rules
node pipeline/eval.mjs       # inspect cluster quality; how the thresholds get tuned
```

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

**Grouping.** Every 30 minutes the pipeline reads ~130 RSS feeds. Headlines are embedded
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

**Blindspots.** A story qualifies when fewer than ten outlets on one side ran it, those
outlets are 20% or less of the coverage, the other side is above a third, at least eight
rated outlets covered it, no more than 35% of coverage comes from poorly-rated outlets,
and the story's primary topic is political.

## What it does badly

- Only ~120 outlets, limited to those with working public feeds. Several major publishers
  killed their RSS; those are reached through a headline index instead, so they contribute
  a headline with no image or blurb.
- Summaries are built from headlines and short feed blurbs, not full articles.
- Local news is thin — a story is placed somewhere only when its headlines name the place.
- Clustering still splits and merges wrongly sometimes. `eval.mjs` exists for exactly this.
- Stories are kept seven days, then dropped.

## Credit

Fulcrum is an independent rebuild of an idea [Ground News](https://ground.news) developed
and popularised. It is not affiliated with them. Headlines, images and links belong to the
publishers who produced them, and every article links back to the original.
