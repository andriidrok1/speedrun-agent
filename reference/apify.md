# Apify reference for Creator Deals

Prepared 2026-09-28. Every claim points to a file under `raw/apify/` (copied
verbatim from Apify's own repos) or to a URL. Anything that came from a web
search is marked **[search 2026-09-28, re-check]** because apify.com itself was
blocked from the machine that wrote this (see
`raw/apify/SEARCH-FINDINGS-2026-09-28.md`). Open the actor page and confirm
before you hard-code a field name or a price.

## 1. What we use Apify for

| Product step (BRIEF.md) | Apify piece |
|---|---|
| Brand agent discovers and scores creators on Instagram, TikTok, X, LinkedIn | Store actors run via API, one per platform (table in section 4) |
| Creator agent pulls its own last 30 days of views | Same actors, one handle, date-filtered (recipe in section 5) |
| Verify the sponsored post is live (URL, caption, tag) | Same actors pointed at the post URL (e.g. Instagram `directUrls` accepts post/reel URLs [search 2026-09-28, re-check]) |
| Agents calling Apify directly from Claude | Apify MCP server (section 2.3) |

Apify concepts in one line: an **Actor** is a serverless program; a **run**
writes results to a **dataset**; you fetch the dataset items. Source:
`raw/apify/docs/api__getting-started.mdx` (Basic workflow).

## 2. Setup

### 2.1 Token

- Create it in Console at Settings > API & Integrations
  (https://console.apify.com/settings/integrations). Source:
  `raw/apify/docs/platform__integrations__programming__api.md` ("API token").
- Send it as `Authorization: Bearer <token>`; the header is recommended over the
  `?token=` query param. Same file ("Authentication") and
  `raw/apify/docs/api__getting-started.mdx`.
- Env var name: `APIFY_TOKEN`. That is what the local MCP server and the Apify
  CLI read (`raw/apify/mcp-server/README.md` Quickstart;
  `raw/apify/agent-skills/apify-ultimate-scraper/SKILL.md` "Authentication").
  The API clients take the token as a constructor argument, so pass
  `process.env.APIFY_TOKEN` / `os.environ["APIFY_TOKEN"]` yourself.
- Never ship it to browser code; scoped tokens (read/run only specific
  resources) are available, but scoped tokens cannot create or modify Actors.
  Source: `raw/apify/docs/platform__integrations__programming__api.md`
  ("Protect your API token", "API tokens with limited permissions").
- Quick check: `GET https://api.apify.com/v2/users/me` returns 200.
  Source: `raw/apify/docs/api__getting-started.mdx` ("Verify your account").

```bash
# .env (never commit)
APIFY_TOKEN=...
```

### 2.2 Client libraries

- JS: `npm install apify-client` (current master version 2.25.1 per its
  package.json on GitHub, fetched 2026-09-28).
- Python: `pip install apify-client`, needs Python 3.11+, current version
  3.2.1. Source: `raw/apify/clients/apify-client-python__README.md`,
  `raw/apify/clients/apify-client-python__CHANGELOG.md`.
- Both retry on network errors, HTTP 429 and 5xx with exponential backoff
  (JS: up to 8 retries by default). Source:
  `raw/apify/clients/apify-client-js__README.md` ("Retries with exponential
  backoff"), Python README "Features".

**Python v3 breaking change:** v3.0.0 (2026-05-20) introduced fully typed
Pydantic responses. Use `run.default_dataset_id` (attribute), not
`run['defaultDatasetId']` as older tutorials do (e.g.
`raw/apify/docs/academy__platform__getting_started__apify_client.md`, which
also has a bug: it assigns `actor = ...call(...)` then reads `run[...]`).
Source: `raw/apify/clients/apify-client-python__README.md` Quick start,
`raw/apify/clients/apify-client-python__CHANGELOG.md` 3.0.0.

### 2.3 MCP server for Claude

Hosted server, recommended. Source:
`raw/apify/docs/platform__integrations__ai__mcp.md` ("Streamable HTTP with
OAuth") and `raw/apify/mcp-server/README.md` ("Quickstart").

```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com?tools=actors,docs,apify/instagram-scraper,clockworks/tiktok-scraper",
      "headers": { "Authorization": "Bearer <APIFY_TOKEN>" }
    }
  }
}
```

- Omit `headers` to use OAuth instead (browser sign-in on first connect).
- `tools=` selects categories or specific actors; the README says to always
  pin `tools` in production because defaults may change. Defaults are
  `actors`, `docs`, `apify/rag-web-browser`, `apify/web-fetch`. Source:
  `raw/apify/mcp-server/README.md` ("Tools configuration").
- The old `/sse` endpoint is removed. Same README, top.
- Local stdio alternative (Claude Desktop style config):

```json
{
  "mcpServers": {
    "actors-mcp-server": {
      "command": "npx",
      "args": ["-y", "@apify/actors-mcp-server"],
      "env": { "APIFY_TOKEN": "YOUR_APIFY_TOKEN" }
    }
  }
}
```

Source: `raw/apify/docs/platform__integrations__ai__mcp.md` ("Local stdio").
The local server lacks output-schema inference that the hosted one has (same
file).

- Claude Code: `apify mcp install claude-code` (Apify CLI) or the Apify
  plugin (`/plugins`, marketplace `https://github.com/apify/apify-claude-code-plugin`).
  Sources: `raw/apify/docs/platform__integrations__ai__mcp.md` ("Apify CLI"
  tab), `raw/apify/docs/platform__integrations__ai__claude__claude-code-cli.md`.
- Key MCP tools: `search-actors`, `fetch-actor-details`, `call-actor`,
  `get-dataset-items`. Important: `call-actor` returns run metadata and a
  `datasetId` but **no items**; you must follow up with `get-dataset-items`.
  Source: `raw/apify/mcp-server/README.md` ("Overview of available tools" and
  the Note under it).
- MCP rate limit: 30 requests/second per user, 429 beyond. Source:
  `raw/apify/docs/platform__integrations__ai__mcp.md` ("Rate limits and
  performance").
- The MCP README also documents agentic payment (x402 / Skyfire / AGI prepaid
  tokens) for running actors without an account; may be relevant to the
  Agentic Payments track pitch, not needed for the build. Source:
  `raw/apify/mcp-server/README.md` ("Agentic payments").

## 3. Run an actor and read its dataset

### JS (adapted from `raw/apify/clients/apify-client-js__README.md` Quick Start)

```js
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// call() starts the run and waits for it to finish.
const run = await client.actor('apify/instagram-scraper').call(
  {
    directUrls: ['https://www.instagram.com/natgeo/'],
    resultsType: 'posts',
    resultsLimit: 30,
    onlyPostsNewerThan: '30 days',
  },
  { maxItems: 60 },            // cap billable results (pay-per-result actors)
);
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

- Input field names above are from search [search 2026-09-28, re-check].
- `maxItems` ("Maximum number of dataset items that will be charged (only for
  pay-per-result Actors)") and `maxTotalChargeUsd` ("Maximum cost in USD (only
  for pay-per-event Actors)") are real options on `start()` / `call()`.
  Source: `raw/apify/clients/apify-client-js__src__resource_clients__actor.ts`
  lines ~97-157.

### Python (adapted from `raw/apify/clients/apify-client-python__README.md`)

```python
import os
from decimal import Decimal
from apify_client import ApifyClient

client = ApifyClient(os.environ["APIFY_TOKEN"])

run = client.actor("clockworks/tiktok-scraper").call(
    run_input={"profiles": ["khaby.lame"], "resultsPerPage": 30},
    max_total_charge_usd=Decimal("1.00"),   # PPE spend cap
)
if run is None:
    raise RuntimeError("Actor run was not found.")

items = list(client.dataset(run.default_dataset_id).iterate_items())
```

- `max_items`, `max_total_charge_usd`, `memory_mbytes`, `run_timeout`,
  `wait_duration` are keyword-only args of `call()`. Source:
  `raw/apify/clients/apify-client-python__src__apify_client___resource_clients__actor.py`
  (`def call`).
- Async variant: `ApifyClientAsync`, same methods with `await`. Source: Python README.

### Raw HTTP (one request, handy for serverless routes)

```bash
curl -X POST \
  -H "Authorization: Bearer $APIFY_TOKEN" -H "Content-Type: application/json" \
  "https://api.apify.com/v2/actors/apify~instagram-scraper/run-sync-get-dataset-items?maxItems=60" \
  -d '{"directUrls":["https://www.instagram.com/natgeo/"],"resultsType":"posts","resultsLimit":30}'
```

- Endpoint and the `maxItems`, `maxTotalChargeUsd`, `timeout`, `memory`,
  `fields`, `limit` params: `raw/apify/docs/apify-api__run-sync-get-dataset-items.yaml`.
- Sync endpoints wait max 300 s, then return 408. For longer runs use
  `POST /v2/actors/:actorId/runs` and poll `GET /v2/actor-runs/:runId`, then
  `GET /v2/datasets/:datasetId/items`. Sources: same yaml;
  `raw/apify/docs/apify-api__openapi-intro-excerpt.yaml` (lines ~100-135);
  `raw/apify/docs/api__getting-started.mdx`.
- Actor id in a URL path uses `~` instead of `/` (`apify~instagram-scraper`).
  Source: `raw/apify/docs/academy__tutorials__api__run_actor_and_retrieve_data_via_api.md` (line ~34).
- Dataset items endpoint returns max 250,000 items per request; paginate with
  `offset`/`limit`. Source: same academy tutorial, line ~267.

## 4. Actor table

All prices and field names here are **[search 2026-09-28, re-check]** unless a
raw file is cited. Details and URLs: `raw/apify/SEARCH-FINDINGS-2026-09-28.md`.
Actor ids also appear in `raw/apify/agent-skills/apify-ultimate-scraper/references/actor-index.md`.

| Platform | Actor id | Key input | View metric in output | Other output | Price per 1,000 results |
|---|---|---|---|---|---|
| Instagram (all-in-one) | `apify/instagram-scraper` | `directUrls`, `resultsType` (posts, reels, comments, mentions, details), `resultsLimit`, `onlyPostsNewerThan` | `videoPlayCount` (reel plays), `videoViewCount` (open issue says inaccurate) | likes, comments, timestamp, url | $2.70 Free / $2.30 Starter / $1.90 Scale / $1.50 Business (third-party page, "verified Sept 9 2026"); one older snippet says $0.50 |
| Instagram reels | `apify/instagram-reel-scraper` | `usernames` (per `raw/apify/agent-skills/.../workflows/social-media-analytics.md`); profile URLs / reel URLs also accepted | `videoPlayCount`, `videoViewCount` | `ownerUsername`, `timestamp`, likes, comments; skill lists `playsCount`, `duration` | $2.60 on Free plan |
| Instagram posts | `apify/instagram-post-scraper` | `usernames`, `resultsLimit`, `scrapePostsUntilDate` (per `.../workflows/social-media-analytics.md`) | none for photos; skill warns it may under-count reels | `likesCount`, `commentsCount`, `timestamp`, `type`, `url` (same skill file) | not found |
| Instagram profiles | `apify/instagram-profile-scraper` | `usernames` (`.../workflows/influencer-vetting.md`) | none (profile level) | `followersCount`, `followsCount`, `postsCount`, `isVerified`, `latestPosts[]` (same skill file) | not found |
| TikTok | `clockworks/tiktok-scraper` | `profiles` (usernames), `resultsPerPage`, `profileScrapeSections` | `playCount` | `diggCount`, `commentCount`, `shareCount`, `createTimeISO`, `authorMeta.fans` (field names from `.../workflows/influencer-vetting.md`, TikTok section) | "from $1.70"; another snippet: PPE $0.03/run start + $0.004/item |
| TikTok profiles | `clockworks/tiktok-profile-scraper` | `profiles`, `resultsPerPage` (0 = profile only), `oldestPostDateUnified` | `playCount` on videos | `authorMeta.name`, `authorMeta.fans`, `authorMeta.heart` (skill file) | 1,000 profiles profile-only $0.75 Free; with 5 videos each $3.75 Free |
| X / Twitter | `apidojo/tweet-scraper` (Tweet Scraper V2) | `twitterHandles` or `startUrls`, `maxItems`, search terms | `viewCount` | `likeCount`, `retweetCount`, `replyCount`, `createdAt`, `author`, `url` | $0.40 flat. **Free plan: demo mode, 5 runs/month, 10 items/run, no API use** |
| X / Twitter (cheaper) | `apidojo/twitter-scraper-lite` | handles / search / ids, `maxItems` | views (per snippet) | likes, retweets, replies | $0.18, event-based |
| X profiles | `apidojo/twitter-user-scraper` | `handles` (skill `social-media-analytics.md`) | none | `followers`, `tweets`, `likes` (skill) | not found |
| LinkedIn posts | `harvestapi/linkedin-profile-posts` | profile URLs, `maxPosts` (0 = all), `postedLimitDate`, `includeReposts`, `includeQuotePosts` | **none: impressions are owner-only** | text, likes, comments, reactions, date, link | $2 ($0.002/post), no cookies |
| LinkedIn profiles | `harvestapi/linkedin-profile-scraper` | profile URLs | none | profile, followers | ~$4 per 1k (HarvestAPI GitHub title for its bulk profile actor) |

Skill guidance on LinkedIn pricing: all LinkedIn actors are community and PPE;
`harvestapi/` roughly $0.001-0.01/result, `apimaestro/` $0.005-0.02. Source:
`raw/apify/agent-skills/apify-ultimate-scraper/references/gotchas.md`
("LinkedIn pricing").

## 5. Recipe: last-30-days average views for one creator

Rule: always filter by timestamp in our code too, even if the actor has a date
filter, because the date-filter inputs are unverified.

```js
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const since = Date.now() - 30 * 24 * 3600 * 1000;

// Per-platform: actor, input builder, item -> {ts, views, likes, comments}
const PLATFORMS = {
  instagram: {
    actor: 'apify/instagram-reel-scraper',
    input: (h) => ({ usernames: [h], resultsLimit: 50, onlyPostsNewerThan: '30 days' }),
    map: (it) => ({ ts: Date.parse(it.timestamp), views: it.videoPlayCount ?? it.videoViewCount,
                    likes: it.likesCount, comments: it.commentsCount }),
  },
  tiktok: {
    actor: 'clockworks/tiktok-scraper',
    input: (h) => ({ profiles: [h], resultsPerPage: 50 }),
    map: (it) => ({ ts: Date.parse(it.createTimeISO), views: it.playCount,
                    likes: it.diggCount, comments: it.commentCount }),
  },
  x: {
    actor: 'apidojo/tweet-scraper',
    input: (h) => ({ twitterHandles: [h], maxItems: 100 }),
    map: (it) => ({ ts: Date.parse(it.createdAt), views: it.viewCount,
                    likes: it.likeCount, comments: it.replyCount }),
  },
  linkedin: {
    actor: 'harvestapi/linkedin-profile-posts',
    input: (h) => ({ profileUrls: [h], maxPosts: 50 }),   // input key name unverified
    map: (it) => ({ ts: Date.parse(it.postedAt?.date ?? it.postedAt), views: null,  // no public views
                    likes: it.engagement?.likes, comments: it.engagement?.comments }), // unverified
  },
};

export async function last30d(platform, handle) {
  const p = PLATFORMS[platform];
  const run = await client.actor(p.actor).call(p.input(handle), { maxItems: 100, maxTotalChargeUsd: 1 });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  const posts = items.map(p.map).filter((x) => Number.isFinite(x.ts) && x.ts >= since);
  const withViews = posts.filter((x) => typeof x.views === 'number');
  const avgViews = withViews.length
    ? withViews.reduce((s, x) => s + x.views, 0) / withViews.length : null;
  const er = posts.length ? posts.reduce((s, x) => s + (x.likes ?? 0) + (x.comments ?? 0), 0)
                           / posts.length : null;   // avg engagements per post
  return { platform, handle, posts: posts.length, postsWithViews: withViews.length, avgViews, avgEngagements: er };
}
```

Notes on the recipe:
- The shape (`call` then `dataset(...).listItems()`) is from
  `raw/apify/clients/apify-client-js__README.md`. `maxItems` /
  `maxTotalChargeUsd` from
  `raw/apify/clients/apify-client-js__src__resource_clients__actor.ts`.
- TikTok field names `playCount`, `diggCount`, `commentCount`, `shareCount`,
  `createTimeISO` are from the Apify agent skill
  (`.../workflows/influencer-vetting.md`); the skill also says engagement rate
  must be computed yourself: `(diggCount + commentCount + shareCount) / playCount`.
- Instagram: use `videoPlayCount` for reels; photo/carousel posts have no view
  count, so average over reels only [search 2026-09-28, re-check].
- LinkedIn has no public views; use engagements as the pricing input and label
  it clearly in the UI [search 2026-09-28, re-check].
- The mapped field names for X and LinkedIn are unverified; log one raw item
  per actor on first run and fix the mapper.
- Use the median as well as the mean; one viral post skews a 30-day average.

## 6. Cost estimate for a demo: 50 profiles x 30 posts

1,500 result items per platform. All prices [search 2026-09-28, re-check].

| Platform / actor | Math | Est. |
|---|---|---|
| Instagram `apify/instagram-scraper` | 1,500 x $2.70/1k (Free) or $2.30 (Starter) | $3.45 to $4.05 |
| TikTok `clockworks/tiktok-scraper` | 1,500 x $1.70/1k, or PPE 1,500 x $0.004 + starts | $2.55 to $6.00+ |
| X `apidojo/tweet-scraper` | 1,500 x $0.40/1k (paid plan only) | $0.60 |
| LinkedIn `harvestapi/linkedin-profile-posts` | 1,500 x $2/1k | $3.00 |
| **All four** | | **~$10 to $14** |

- Free plan gives $5/month of usage [search 2026-09-28, re-check]; once used,
  the platform stops until the next cycle (pay-as-you-go only on paid plans).
  Source for the stop rule: `raw/apify/docs/platform__account__billing__subscriptions.mdx`
  ("Try Apify for free").
- So: one platform fits the free tier; all four needs a paid plan (Starter,
  reported as $29/month, conflicting reports of $19/$39 [search 2026-09-28,
  re-check at https://apify.com/pricing]). X's Tweet Scraper V2 needs a paid
  plan regardless.
- Compute units: 1 CU = 1 GB RAM for 1 hour; $0.2/CU on Free/Starter, $0.16
  Scale, $0.13 Business. Source:
  `raw/apify/docs/platform__actors__running__usage_and_resources.md` ("What is
  a compute unit"), `raw/apify/docs/platform__actors__monetizing__pricing-and-costs__index.mdx`
  (unit cost table), `raw/apify/docs/platform__account__billing__subscriptions.mdx`.
  For pay-per-result/PPE actors most event prices include platform usage, but
  some charge usage separately: check each actor's pricing tab. Source:
  `raw/apify/docs/platform__actors__running__store__index.md` ("Pay per event").
- Store pricing models: pay per event, pay per usage, rental (rental being
  sunset). Same file.
- Cheaper demo: scrape once, cache the JSON in our DB/fixtures, and run live
  only for the one creator shown on stage.

## 7. Gotchas

1. **Views are not uniform.** TikTok `playCount` and X `viewCount` are public;
   Instagram only has plays on reels/videos (`videoPlayCount`; `videoViewCount`
   may be blank or inaccurate); LinkedIn has no public view count at all.
   [search 2026-09-28, re-check], URLs in `raw/apify/SEARCH-FINDINGS-2026-09-28.md`.
2. **Login walls.** Instagram actors see the logged-out web only (public
   accounts). Some social actors need cookies; empty results often mean a
   block or missing cookies. Source:
   `raw/apify/agent-skills/apify-ultimate-scraper/references/gotchas.md`
   ("Cookie-dependent Actors", "Empty results").
3. **Platform rate limits** per the Apify skill: Instagram keep
   `maxResults` under 200 per run; LinkedIn batches under 100 profiles, runs 5
   min apart; TikTok anti-bot increasing, use residential proxy if blocked.
   Source: same gotchas.md ("Platform-specific rate limits").
4. **Apify API rate limits:** 250,000 requests/min global per user; 60
   req/s per resource (one dataset, one run). Source:
   `raw/apify/docs/apify-api__openapi-intro-excerpt.yaml` ("Rate limiting").
   MCP: 30 req/s per user.
5. **Concurrent runs:** 25 on Free, 32 Starter, 128 Scale, 256 Business.
   Batch many handles into one run (actors take arrays) instead of 50 runs.
   Source: `raw/apify/docs/platform__account__limits.md`.
6. **Sync endpoints time out at 300 s** (HTTP 408). Use `call()` from the
   client (waits indefinitely) or async run + poll. Source:
   `raw/apify/docs/apify-api__run-sync-get-dataset-items.yaml`.
7. **Input names differ per actor** (`maxItems`, `resultsLimit`,
   `maxResults`...). Always fetch the input schema: MCP `fetch-actor-details`
   or `apify actors info ACTOR_ID --input --json`. Source: gotchas.md
   ("maxResults vs maxCrawledPages").
8. **Always cap spend** with `maxItems` / `maxTotalChargeUsd` on every call;
   a missing cap on a broad query is the common way to burn credits. Sources:
   client source files above; `raw/apify/docs/platform__actors__running__store__index.md`
   (max charge per run).
9. **Unnamed datasets expire** (Free plan keeps the 10 most recent runs for
   4 months per the doc); copy what you need into our DB. Source:
   `raw/apify/docs/platform__storage__index.md` ("Data retention").
10. **Python client v3** returns typed objects (`run.default_dataset_id`), old
    dict-style tutorials break. See section 2.2.
11. **MCP `call-actor` does not return items**; call `get-dataset-items` next.
    Source: `raw/apify/mcp-server/README.md`.
12. The Apify skill says the Instagram post scraper may under-count reels;
    run the reel scraper too. Source:
    `raw/apify/agent-skills/apify-ultimate-scraper/references/workflows/social-media-analytics.md`.
13. Instagram and TikTok are `apify`/`clockworks` actors (Apify-maintained per
    the actor index); X and LinkedIn actors are community-maintained. Source:
    `raw/apify/agent-skills/apify-ultimate-scraper/references/actor-index.md`.

## 8. Unverified (check on the actor page before relying on it)

- Every price in sections 4 and 6, and all plan prices (Starter $29 vs
  $19/$39; free $5 credits).
- Input names: `resultsType`, `onlyPostsNewerThan` (instagram-scraper);
  `resultsLimit`/`onlyPostsNewerThan` on instagram-reel-scraper;
  `oldestPostDateUnified`, `profileScrapeSections` (TikTok); `twitterHandles`
  (X); `profileUrls`, `maxPosts`, `postedLimitDate` (LinkedIn).
- Output names for X (`viewCount`, `createdAt`, `likeCount`) and all LinkedIn
  output names (the mapper in section 5 guesses).
- Whether `clockworks/tiktok-scraper` is $1.70/1k or PPE $0.004/item (two
  snippets disagree; the $0.004 may belong to the profile scraper).
- Whether `apidojo/tweet-scraper` charges $0.016 per profile with 40 free
  tweets when using `twitterHandles`.
- The agent skill itself is inconsistent on TikTok profile output
  (`authorMeta.*` in influencer-vetting.md vs `followers`, `recentVideos[]` in
  social-media-analytics.md).
- Whether `videoPlayCount` is populated for every reel (open issues say some
  are missing).

## 9. Raw file index (`raw/apify/`, ~0.8 MB)

- `mcp-server/`: README, manifest.json, server.json, package.json, CHANGELOG,
  claude-code-tools.json (from github.com/apify/apify-mcp-server).
- `agent-skills/apify-ultimate-scraper/`: SKILL.md, references/actor-index.md,
  gotchas.md, workflows/*.md (from github.com/apify/agent-skills).
- `clients/`: JS and Python client READMEs, Python CHANGELOG (top), `actor.ts`
  and `actor.py` source (from github.com/apify/apify-client-js and
  apify-client-python, master, fetched 2026-09-28).
- `docs/`: files from github.com/apify/apify-docs `sources/` (path with `/`
  replaced by `__`): API token, API getting started, running actors,
  input/output, runs and builds, usage and compute units, Store pricing models,
  pay per event, rental, billing and subscriptions, limits, storage and
  datasets, MCP and Claude Code integration, residential proxy, academy client
  and API tutorials; plus two OpenAPI excerpts.
- `SEARCH-FINDINGS-2026-09-28.md`: every web-search fact with its URL.
