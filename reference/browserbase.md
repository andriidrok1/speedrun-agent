# Browserbase + Stagehand reference (Creator Deals)

Compiled 2026-09-28 for the hackathon team. Every claim points at a file under
`raw/browserbase/` (paths below are relative to that folder) or at a URL.
Anything not backed that way is in the "Unverified" list at the end.

Source freshness, read this first:

| Source in `raw/browserbase/` | Upstream | Last commit | Trust |
|---|---|---|---|
| `browserbase_stagehand/` (docs v4, CLI, SDK READMEs) | github.com/browserbase/stagehand | 2026-09-28 | Current. Primary source. |
| `browserbase_templates/` | github.com/browserbase/templates | 2026-09-25 | Current. Uses Stagehand v4. |
| `browserbase_skills/` | github.com/browserbase/skills | 2026-09-01 | Current. |
| `browserbase_mcp-server-browserbase/` | github.com/browserbase/mcp-server-browserbase | 2026-07-20 | **Repo is archived** (see its README.md line 3). |
| `browserbase_docs/` | github.com/browserbase/docs | **2024-05-15** | **Stale** (old v1 API, pre-contexts docs). Kept for API shape history only. The live docs at docs.browserbase.com are not in any public repo we could reach, and browserbase.com is blocked from this sandbox. |
| `npm/*.json` | registry.npmjs.org, pypi.org | fetched 2026-09-28 | Current package versions and deprecation notices. |

Current versions (from `npm/`): `@browserbasehq/stagehand` 4.1.0 (v3 line: 3.7.3), `@browserbasehq/sdk` 2.21.0, Python `stagehand` 4.1.0 (requires Python >=3.11), Python `browserbase` 1.20.0, CLI `browse` 0.11.0, `@browserbasehq/mcp` 3.0.0.

---

## 1. What we use it for in Creator Deals

The brief (`../BRIEF.md`) names Apify for discovery and live-post checks. Browserbase is the browser layer for the parts where an actor is missing, flaky, or we need a real rendered page:

| Job in the product | Browserbase piece | Why |
|---|---|---|
| Read a brand's website (what they sell, tone, category for the creator's refuse list) | `browserbase.fetch()` markdown, fall back to a browser session + `extract()` | Fetch is cheap and needs no browser; it cannot run JS (`browserbase_stagehand/packages/docs/v4/add-ons/fetch.mdx`, "When to use a browser instead", "Limits"). |
| Scrape a creator profile and its recent posts (views, likes, comments, date) | Browser session + Stagehand `extract()` with a zod schema | Profiles on IG/TikTok are client-rendered, so Fetch alone will usually not see the numbers (same fetch.mdx warning). |
| Verify a sponsored post is live before Stripe payout | Fetch the post URL for status code, then a browser session + `extract()` to confirm caption, tag or link | Fetch reports the real HTTP status and lets you "tell a real page from a soft 404 or a bot wall" (fetch.mdx "Response"). |
| Stay logged in (only if we decide to scrape logged-in, see section 6) | Browserbase Contexts (`browserSettings.context { id, persist }`) | `browserbase_templates/typescript/context/index.ts`, `browserbase_stagehand/packages/docs/v4/best-practices/user-data.mdx`. |
| Web search for creators or brand info without a browser | `bb.search.web()` / `browserbase.search()` | `browserbase_templates/typescript/browser-agent-demo/index.ts`, `browserbase_stagehand/packages/docs/v4/add-ons/search.mdx`. |
| Let our agent drive a browser freely (optional) | Stagehand code mode (`code_execute` tool over MCP) | `browserbase_templates/typescript/browser-agent-demo/`. |

---

## 2. Setup

### 2.1 Keys and env vars

- `BROWSERBASE_API_KEY`: the only required value. Dashboard: https://browserbase.com/settings (per `browserbase_templates/typescript/getting-started-with-browserbase/.env.example`). Key format in docs examples is `bb_live_...` (`browserbase_stagehand/packages/docs/v4/add-ons/fetch.mdx`, `browserbase_stagehand/packages/cli/README.md`).
- `BROWSERBASE_PROJECT_ID`: optional. "Optional, inferred from your API key if not provided" (`browserbase_templates/typescript/getting-started-with-browserbase/.env.example`). Still passed explicitly in `bb.sessions.create({ projectId })` in `browserbase_stagehand/packages/docs/v4/migrations/v3.mdx` and the old MCP config.
- No OpenAI/Anthropic/Google key needed for Stagehand when running on Browserbase: "Stagehand primitives use the Browserbase Model Gateway, so they need only `BROWSERBASE_API_KEY`" (`browserbase_templates/README.md`, "Model Gateway"). Details in section 5.
- `AI_GATEWAY_API_KEY`: only for the browser-agent-demo's outer Vercel AI SDK agent (`browserbase_templates/typescript/browser-agent-demo/.env.example`).
- **Stagehand does not read env vars for you.** "Read the values in your own app code and pass them explicitly" (`browserbase_stagehand/packages/docs/v4/first-steps/installation.mdx`). Every snippet below passes `apiKey` explicitly.

Never commit keys. Treat context IDs as credentials too (`user-data.mdx` warning).

### 2.2 Install (TypeScript, our default)

From `browserbase_stagehand/packages/docs/v4/first-steps/installation.mdx`:

```bash
pnpm add @browserbasehq/stagehand 'zod@~4.4.3'
```

> "Keep Zod on the `4.4.x` minor version to match Stagehand's supported types. Newer Zod minor versions can cause TypeScript errors when passing schemas to `extract()`." (`first-steps/quickstart.mdx`)

Runtime: "Stagehand requires Node.js 22.18 or later, Python 3.11 or later, or Go 1.26 or later." Bun is supported (`installation.mdx`).

Add the raw platform SDK only if you need sessions/contexts/search directly:

```bash
pnpm add @browserbasehq/sdk
```

(used by `browserbase_templates/typescript/context/index.ts` and `getting-started-with-browserbase`.)

Python: `pip install stagehand` (`installation.mdx`), plus `browserbase` for the platform SDK (`browserbase_stagehand/packages/docs/v4/configuration/browser.mdx`, "Alternative: Browserbase SDK").

### 2.3 CLI: `bb` is now `browse`

The setup steps we were given say `bb projects list` and `bb templates clone browser-agent-demo --language <ts|python>`. That CLI was renamed:

- npm `@browserbasehq/cli` (bin `bb`) latest 0.5.7 is **deprecated** with the message: "The Browserbase CLI is now published as 'browse'. Please migrate by running: npm uninstall -g @browserbasehq/cli && npm install -g browse" (`npm/_browserbasehq_cli.json`).
- The `browse` package 0.11.0 (`npm/browse.json`) is the same CLI; its CHANGELOG still contains the `bb ...` entries from 0.2.0 to 0.5.x (`browserbase_stagehand/packages/cli/CHANGELOG.md`), and 0.6.0 moved platform commands under `browse cloud`.

Command mapping (all from `browserbase_stagehand/packages/cli/README.md` and `src/commands/**`):

| Old (`bb`) | Current (`browse`) | Source |
|---|---|---|
| `npm i -g @browserbasehq/cli` | `npm install -g browse` | cli/README.md |
| `bb projects list` | `browse cloud projects list` (`--json` for scripts) | `src/commands/cloud/projects/list.ts` |
| `bb templates clone <slug>` | `browse templates clone <slug> [path] --language typescript\|python` | `src/commands/templates/clone.ts` |
| `bb sessions create ...` | `browse cloud sessions create --proxies --solve-captchas --context-id <id> --persist` | `src/commands/cloud/sessions/create.ts` examples |
| `bb contexts create` | `browse cloud contexts create --name <name>` | `src/commands/cloud/contexts/create.ts` |
| `bb fetch` | `browse cloud fetch <url> [--format raw\|markdown\|json]` | `src/commands/cloud/fetch.ts` |
| `bb sessions debug <id>` | `browse cloud sessions debug <id>` | `src/commands/cloud/sessions/debug.ts`; old name in `browserbase_skills/skills/browser/REFERENCE.md` line 454 |
| `bb skills` | `browse skills install` / `npx skills add browserbase/skills` | CHANGELOG 0.2.0, cli/README.md |

Note on `--language`: the flag takes `typescript` or `python` (not `ts`), per `options: [...languages]` with `languages = ["typescript", "python"]` in `src/commands/templates/clone.ts`.

**`browser-agent-demo` has no Python version.** The templates README table lists it as TS only (`browserbase_templates/README.md`), and there is no `python/browser-agent-demo` folder. Closest Python equivalents we copied: `python/getting-started-with-browserbase` (Search + Fetch + Sessions) and `python/business-lookup` (agent + Stagehand code mode via LangChain Deep Agents, per the README "Stagehand V4 note"). `browse templates clone browser-agent-demo --language python` will presumably fail; try it once to confirm (unverified).

`https://browserbase.com/SKILL.md`: exists (search result title "--- name: browserbase", https://www.browserbase.com/SKILL.md), but browserbase.com is blocked from this sandbox so we could not read it. Search snippets say it tells an agent to `npm install -g @browserbasehq/cli` then `bb skills --install` (WebSearch 2026-09-28). That conflicts with the npm deprecation above, so prefer `browse`. The equivalent content we do have: `browserbase_stagehand/packages/cli/skills/browse/SKILL.md` and `browserbase_skills/skills/*/SKILL.md`.

### 2.4 MCP config for Claude

Three options, in order of preference:

1. **Hosted Browserbase MCP** (`browserbase_mcp-server-browserbase/README.md`, "SHTTP (Hosted MCP)"):

   ```json
   {
     "mcpServers": {
       "browserbase": {
         "type": "http",
         "url": "https://mcp.browserbase.com/mcp"
       }
     }
   }
   ```

   Tools: `start`, `end`, `navigate`, `act`, `observe`, `extract` (same README, "Tools"). How the hosted server authenticates with your key is described only on docs.browserbase.com (unverified, blocked).

2. **Self-hosted npm server** (same README, "To run via NPM"). The repo is archived but `@browserbasehq/mcp` 3.0.0 is still on npm (`npm/_browserbasehq_mcp.json`):

   ```json
   {
     "mcpServers": {
       "browserbase": {
         "command": "npx",
         "args": ["@browserbasehq/mcp"],
         "env": {
           "BROWSERBASE_API_KEY": "",
           "BROWSERBASE_PROJECT_ID": "",
           "GEMINI_API_KEY": ""
         }
       }
     }
   }
   ```

   Flags: `--proxies`, `--verified` (Scale plan), `--keepAlive`, `--contextId <id>`, `--persist`, `--modelName` (default `google/gemini-2.5-flash-lite`), `--modelApiKey` (README "Configuration").

3. **Stagehand v4 facade MCP for Claude Code** (current, experimental, built from the stagehand repo): `browserbase_stagehand/packages/docs/v4/integrations/cli-agents/claude-code.mdx` and `browserbase_stagehand/packages/integrations/claude-code/.mcp.json`:

   ```json
   {
     "mcpServers": {
       "stagehand": {
         "command": "node",
         "args": ["../core/dist/facade/stdio-server.mjs"]
       }
     }
   }
   ```

   Tools: `mcp__stagehand__run`, `mcp__stagehand__snapshot`, `mcp__stagehand__screenshot`. Env: `STAGEHAND_BROWSER=browserbase`, `BROWSERBASE_API_KEY`, optional `BROWSERBASE_PROJECT_ID`. Requires Node 24+ and pnpm 11.10.0 per that page.

Skills plugin for Claude Code (`browserbase_skills/README.md`): `/plugin marketplace add browserbase/skills` then `/plugin install browse@browserbase`.

---

## 3. Code snippets (quoted from sources)

### 3.1 Create a session

Via Stagehand (recommended; `browserbase_stagehand/packages/docs/v4/configuration/browser.mdx`, "Basic setup"):

```typescript
import { browserbase, Stagehand } from "@browserbasehq/stagehand";

const browser = await browserbase.launch({
  apiKey: process.env.BROWSERBASE_API_KEY,
});
const stagehand = await Stagehand.create({ browser });
```

With options (same file, "Advanced Browserbase configuration example"):

```typescript
const browser = await browserbase.launch({
  apiKey: process.env.BROWSERBASE_API_KEY,
  proxies: true,
  region: "us-west-2",
  timeout: 3600, // 1 hour session timeout
  keepAlive: true, // Available on Startup plan
  browserSettings: {
    verified: false, // this is a Scale Plan feature - reach out to support@browserbase.com to enable
    blockAds: true,
    solveCaptchas: true,
    recordSession: false,
    viewport: {
      width: 1920,
      height: 1080,
    },
  },
  userMetadata: {
    userId: "automation-user-123",
    environment: "production",
  },
});
```

Regions: `us-west-2` (default), `us-east-1`, `eu-central-1`, `ap-southeast-1` (browser.mdx "Multi-region support").

Raw SDK + Playwright (no Stagehand; `browserbase_templates/typescript/getting-started-with-browserbase/index.ts`):

```typescript
const session = await bb.sessions.create({});
console.log(`Session ID: ${session.id}`);
console.log(`Live view: https://browserbase.com/sessions/${session.id}`);

const browser = await chromium.connectOverCDP(session.connectUrl);
const page = browser.contexts()[0]?.pages()[0];
```

Getting the session ID with Stagehand v4 (`stagehand.browserbaseSessionID` is gone; `migrations/v3.mdx`, "The Browserbase session ID"):

```typescript
import { Browserbase } from "@browserbasehq/sdk";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID,
});
const browser = await browserbase.connect({
  apiKey: process.env.BROWSERBASE_API_KEY,
  sessionId: session.id,
});
console.log(session.id);
```

But see gotcha G3: `browser.mdx` says a self-created session must include the uploaded Stagehand `extensionId`.

### 3.2 Stagehand extract of a profile's recent posts (zod)

The primitive, quoted (`browserbase_stagehand/packages/docs/v4/basics/extract.mdx`, "Array" tab):

```typescript
const { data } = await stagehand.extract(
  "extract all apartment listings",
  z.object({
    apartments: z.array(
      z.object({
        address: z.string(),
        price: z.string(),
        sqft: z.number(),
      }),
    ),
  }),
);
```

URLs must be typed as URLs: "To extract links or URLs, define the relevant field as a URL type" and use `z.url()` (extract.mdx "Link extraction"). Scope to part of the page with `{ locator: page.locator(...) }` to cut tokens (extract.mdx "Targeted extract").

Composed for our use (built only from the calls above plus the page API in `quickstart.mdx`; the field names and instruction are ours, and whether IG/TikTok render these numbers to a logged-out browser is unverified, see section 6):

```typescript
import { browserbase, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v4";

const RecentPosts = z.object({
  handle: z.string(),
  followers: z.string().describe("follower count as shown, e.g. 312K"),
  posts: z.array(
    z.object({
      url: z.url(),
      postedAt: z.string().nullable(),
      views: z.string().nullable().describe("view or play count as shown"),
      likes: z.string().nullable(),
      comments: z.string().nullable(),
      caption: z.string().nullable(),
    }),
  ),
});

const browser = await browserbase.launch({
  apiKey: process.env.BROWSERBASE_API_KEY,
  proxies: true,
  browserSettings: { solveCaptchas: true },
});
try {
  const stagehand = await Stagehand.create({ browser });
  try {
    const [page] = await browser.context.pages();
    await page.goto("https://www.tiktok.com/@somecreator", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const { data } = await stagehand.extract(
      "extract the profile handle, follower count, and the most recent posts visible on the grid with their URL and view count",
      RecentPosts,
    );
    console.log(data);
  } finally {
    await stagehand.close();
  }
} finally {
  await browser.close();
}
```

Counts come back as display strings ("312K"); parse them in our code rather than asking the model to do arithmetic. Visible grids show views but usually not likes/comments per post without opening each post (unverified).

### 3.3 Verify a post URL is live

Step 1, cheap HTTP check (`browserbase_stagehand/packages/docs/v4/add-ons/fetch.mdx`):

```typescript
const result = await browserbase.fetch({
  apiKey: process.env.BROWSERBASE_API_KEY,
  url: "https://example.com/protected",
  format: "markdown",
  proxies: true,          // route through Browserbase's proxy network
  allowRedirects: true,   // follow HTTP redirects
  allowInsecureSsl: true, // skip TLS certificate verification
});
```

Relevant facts from the same page: `statusCode` is the target's real status and "A fetch that reaches a `404` succeeds as a call and reports `404` here"; `allowRedirects` defaults to false "so a redirect is reported as its `3xx` status"; limits 5 MB, 60 s timeout, no JavaScript.

Step 2, rendered check (composed from `extract.mdx` basic schema; our field names):

```typescript
const PostCheck = z.object({
  isPostPage: z.boolean().describe("false if this is a login wall, error page, or 'post unavailable'"),
  caption: z.string().nullable(),
  mentionsBrand: z.boolean(),
  containsLink: z.boolean(),
});
await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
const { data } = await stagehand.extract(
  `Is this a live post? Does its caption mention @${brandHandle} or contain ${trackingLink}?`,
  PostCheck,
);
```

Payout rule suggestion: release only when Fetch returned 200 (after redirects) and the rendered extract says `isPostPage && (mentionsBrand || containsLink)`. A 200 alone is not proof: social sites can return 200 for a login wall or a "not available" page (unverified per platform; test with a deleted post URL). Keep the Browserbase session ID and recording (`recordSession` defaults unverified) as evidence for disputes.

### 3.4 Contexts: stay logged in

From `browserbase_templates/typescript/context/index.ts` (create context, log in once with `persist: true`, reuse):

```typescript
const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });
const context = await bb.contexts.create();

const browser = await browserbase.launch({
  apiKey: process.env.BROWSERBASE_API_KEY!,
  browserSettings: {
    context: {
      id: context.id,
      persist: true, // Save authentication state to context
    },
  },
});
```

Later runs pass the same `id` with `persist: true` so "any new changes (cookies, cache) are saved back to context" (same file). Always close the browser so state is saved: "Always close session to release resources and save any context changes." Cleanup:

```typescript
// The generated SDK currently sets a JSON content type on DELETE, so send an
// explicit empty object instead of an empty body.
await bb.contexts.delete(contextId, { body: {} });
```

Pass credentials with act variables so they are not sent to the model: `await stagehand.act("type %password% into the password field", { variables: { password: process.env.USER_PASSWORD } });` and set `cache: false` on those calls because server-side caching "sends variable values to the cache service" (`basics/act.mdx`, "Secure your automations").

Alternatives: `browserbase_templates/typescript/manual-mfa-with-contexts/` (human completes MFA once via live view, context keeps it), `browserbase_skills/skills/cookie-sync/SKILL.md` (copy cookies from local Chrome into a persistent context).

### 3.5 Search (no browser)

From `browserbase_templates/typescript/browser-agent-demo/index.ts`:

```typescript
const bb = new Browserbase({ apiKey });
const searchData = await bb.search.web({
  query,
  numResults: 5,
});
```

Limits: query 1 to 200 chars, 1 to 25 results, 120 requests per minute per project, 429 on excess (`add-ons/search.mdx`, "Limits").

---

## 4. Stealth, proxies, captchas

- Built-in proxies: `proxies: true`. Geolocation: `proxies: [{ type: "browserbase", geolocation: { city: "NEW_YORK", state: "NY", country: "US" } }]` (`browserbase_templates/typescript/proxies/index.ts`). "Browserbase Developer plan or higher is required to use proxies" (`browserbase_templates/typescript/proxies/README.md`).
- Captchas: `browserSettings: { solveCaptchas: true }`; the template comment says "true by default" (`browserbase_templates/typescript/basic-captcha-solving/index.ts`).
- Verified browsers (formerly Advanced Stealth): `browserSettings.verified`, Scale plan only (`configuration/browser.mdx` example comment; CLI CHANGELOG 0.9.2 "`--verified` requires a Browserbase Scale plan"; CLI 0.6.0 keeps `--advanced-stealth` as a hidden alias). The browser-agent-demo README still says `advancedStealth: true`, which is the old name.
- Old stealth docs: `browserbase_docs/features/stealth-mode.mdx` (2024, stale).

---

## 5. Pricing

Fetched via WebSearch on 2026-09-28. browserbase.com/pricing itself is blocked from this sandbox, so numbers come from search summaries of that page and third-party write-ups. **Re-check on https://www.browserbase.com/pricing before relying on any number.**

| Item | Free | Developer | Startup | Scale | Source |
|---|---|---|---|---|---|
| Price / month | $0 | $20 | $99 | Custom | [browserbase.com/pricing](https://www.browserbase.com/pricing) (title "Free, $20, $99, or Custom") |
| Browser hours included | 1 | 100 | 500 | Custom | [scrapegraphai](https://scrapegraphai.com/blog/browserbase-pricing), [tinyfish](https://www.tinyfish.ai/blog/browserbase-pricing) |
| Browser hour overage | n/a | $0.12/h | $0.10/h | Custom | same |
| Concurrent browsers | 3 | 25 | 100 | 250+ | same |
| Proxy bandwidth | not listed | 1 GB incl, then ~$12/GB | 5 GB incl, then $10/GB | Custom | [scrapegraphai](https://scrapegraphai.com/blog/browserbase-pricing), [makerstack](https://makerstack.co/reviews/browserbase-review/) |
| Search calls | 1,000 | 1,000 incl, then $7 / 1,000 | not found | Custom | search summary of pricing page |
| Fetch calls | 1,000 | 10,000 incl, then $1 / 1,000 ($4 with proxies) | not found | Custom | [tinyfish](https://www.tinyfish.ai/blog/browserbase-pricing), [usagepricing](https://www.usagepricing.com/blueprint/browserbase) |
| Extract (Fetch json) | | +$4 / 1,000 ($7 with proxies) | | | search summary |
| Session length cap | 15 min | not confirmed | not confirmed | | [aitrendtool](https://aitrendtool.com/tools/browserbase) |
| Data retention | 7 days | 7 days | 30 days | 30 days | search summary |
| Model tokens (Model Gateway) | $5 included | market price, no markup | market price | | [Model Gateway blog](https://www.browserbase.com/blog/model-gateway); in-repo: "Browserbase charges the same price as going direct to the provider. No markup." (`browserbase_stagehand/packages/docs/v4/configuration/models.mdx`, "Key benefits") |
| keepAlive | | | Startup plan | | `configuration/browser.mdx` comment |
| Verified browsers | | | | Scale only | `configuration/browser.mdx`, CLI CHANGELOG 0.9.2 |
| Proxies at all | no | yes | yes | yes | `browserbase_templates/typescript/proxies/README.md` ("Developer plan or higher") |

Stagehand itself is MIT open source (`browserbase_stagehand/README.md`); its only cost is the model tokens (Gateway or your own provider key) and the Browserbase browser time. Cheap-model and caching advice: `browserbase_stagehand/packages/docs/v4/best-practices/cost-optimization.mdx`.

Hackathon math (our estimate, not a source): 50 creator profile scrapes at ~1 min each is under 1 browser hour, so the Free plan's 1 hour is tight; Developer ($20) is the realistic floor, and it is also the minimum for proxies.

---

## 6. Instagram / TikTok login walls and ToS risk

- Both platforms show login prompts or limited content to logged-out browsers, especially from datacenter IPs (general knowledge; unverified for today's behavior). Mitigations available in Browserbase: residential/geo proxies, captcha solving, Verified browsers (Scale), and contexts for a logged-in state (sections 3.4 and 4).
- **Legal line that matters for us:** in Meta v. Bright Data (N.D. Cal., Jan 23 2024) the court held Meta's terms did not bar scraping of public data while logged out; the terms apply to a user who is logged in and "using" the product ([Zyte summary](https://www.zyte.com/blog/california-court-meta-ruling/), [Courthouse News](https://www.courthousenews.com/federal-judge-rules-against-meta-in-data-scraping-case/)). So logging in with a context to scrape IG is exactly the case the ruling does not cover and exposes the account (and us) to ToS enforcement. Recommendation: scrape logged-out only; use contexts only for the creator's own account where the creator is the one authorizing access, or better, use official APIs / Apify actors for that side.
- TikTok, X and LinkedIn have their own terms; we did not research them (unverified). LinkedIn is notoriously aggressive about scraping.
- The product only needs public profile stats and a public post URL check, which fits the logged-out case. Keep request volume low and cache results.
- This is not legal advice.

---

## 7. Gotchas

- **G1. `bb` is deprecated, use `browse`.** Section 2.3. `browse cloud projects list`, not `bb projects list`.
- **G2. No Python browser-agent-demo.** Section 2.3.
- **G3. Session creation paths conflict in the docs.** `migrations/v3.mdx` shows `bb.sessions.create({ projectId })` then `browserbase.connect({ sessionId })`, while `configuration/browser.mdx` ("Alternative: Browserbase SDK") says a self-created session must include the uploaded Stagehand extension (`extensionId`) because "Extensions cannot be added after a browser session starts". Safest: let `browserbase.launch()` create the session (it handles the extension upload) and only use the SDK for contexts/search.
- **G4. Stagehand v4 has no `agent()`.** "V4 does not expose the V3 `agent()` orchestration API" (`browserbase_templates/README.md`; `migrations/v3.mdx` "Why agent() is gone"). Blog posts and older examples using `stagehand.agent(...)`, `new Stagehand({ env: "BROWSERBASE" })`, `stagehand.page`, `page.act()` are v3. In v4 use `Stagehand.create({ browser })`, `browser.context.pages()`, and `stagehand.act/extract/observe`. For an agent loop, use your own LLM with `code_execute` (browser-agent-demo). v3 docs kept at `browserbase_stagehand/packages/docs/v3/basics/agent.mdx` for reference only.
- **G5. Primitives return `{ data, metadata }`**, not the bare value (`migrations/v3.mdx` "Every primitive returns data and metadata"; `extract.mdx` "Return value").
- **G6. Zod pin:** `zod@~4.4.3`, import from `"zod/v4"` (`quickstart.mdx`).
- **G7. Env vars are not auto-read** by Stagehand (`installation.mdx`). A missing `apiKey` param is a silent-looking config bug.
- **G8. Model Gateway only works on Browserbase browsers**, not local Chrome; a local run needs a `model` with its own `apiKey` (`quickstart.mdx` note, `models.mdx`). Gateway also "rejects `stopSequences`" (`models.mdx`).
- **G9. Server-side caching is on by default** and sends act variables to the cache service; set `cache: false` for credential steps (`basics/act.mdx`).
- **G10. Fetch does not run JS**, 5 MB / 60 s limits, `allowRedirects` false by default (`add-ons/fetch.mdx`). Social pages need the browser path.
- **G11. Close everything in `finally`.** Unclosed sessions keep billing browser time until timeout, and contexts only save on close (`templates/typescript/context/index.ts`, browser-agent-demo README "Session not closing").
- **G12. Context IDs are credentials** (`best-practices/user-data.mdx` warning). Store them server-side, one per account.
- **G13. MCP server repo is archived**; hosted endpoint `https://mcp.browserbase.com/mcp` is the recommended path (its README).
- **G14. Code mode runs model-authored JS** and "is not itself a security sandbox" (browser-agent-demo README "SAFETY"). Do not feed it untrusted brand pages with our Stripe keys in the same process env.
- **G15. Search rate limit** 120/min per project, 429 on excess (`add-ons/search.mdx`).
- **G16. `browserbase_docs/` is 2024.** Do not copy API shapes from it without checking against the templates or Stagehand v4 docs.

---

## 8. Unverified

- Everything in the pricing table (from search snippets, not a direct page read). Re-check https://www.browserbase.com/pricing.
- Session length caps on paid plans, and whether `recordSession` / session recording is on by default.
- The exact contents of https://www.browserbase.com/SKILL.md (blocked; only search snippets seen).
- Whether `browse templates clone browser-agent-demo --language python` fails or falls back.
- How the hosted MCP endpoint authenticates (API key header, OAuth). Only docs.browserbase.com describes it; blocked.
- Whether Instagram and TikTok currently render follower counts, per-post view counts, and post pages to a logged-out Browserbase browser, with or without proxies; and what a deleted/private post returns (status code and page text). Test on day one.
- Per-post likes/comments visibility on grid views.
- Whether `projectId` is still required anywhere in SDK 2.21.0 `sessions.create` (templates omit it; migration doc passes it).
- TikTok, X, LinkedIn ToS positions on automated access.
- Whether the Free plan includes proxies (sources say Developer or higher).

---

## 9. Index of `raw/browserbase/`

- `browserbase_stagehand/packages/docs/v4/`: full current Stagehand docs (first-steps, basics act/extract/observe, configuration browser/models, add-ons fetch/search, best-practices incl. user-data, cost, caching, migrations/v3, reference, integrations incl. cli-agents/claude-code).
- `browserbase_stagehand/packages/docs/v3/`: `basics/agent.mdx`, `basics/extract.mdx`, `configuration/models.mdx`, `best-practices/cost-optimization.mdx`, `integrations/mcp/` (older API, reference only).
- `browserbase_stagehand/packages/cli/`: `browse` CLI README, CHANGELOG, package.json, bundled skill, `src/commands/templates` and `src/commands/cloud` sources.
- `browserbase_stagehand/packages/sdk-ts`, `sdk-python`: READMEs and package manifests. `packages/integrations/claude-code/`: `.mcp.json`, README.
- `browserbase_templates/`: README plus `typescript/` and `python/` versions of browser-agent-demo (TS only), context, manual-mfa-with-contexts, proxies, basic-captcha-solving, smart-fetch-scraper, getting-started-with-browserbase, website-link-tester, business-lookup.
- `browserbase_mcp-server-browserbase/`: README, CHANGELOG, package.json, server.json, config.d.ts, gemini-extension.json, `src/config.ts`, `src/program.ts`, `src/tools/`.
- `browserbase_skills/`: README and skills browser, fetch, search, cookie-sync, functions.
- `browserbase_docs/` (2024, stale): README, introduction, quickstart, features (sessions, stealth-mode, browsers, screenshots), guides (authentication, contexts-and-pages, parallelization, session-debug-connection), api-reference (sessions, SDKs).
- `npm/`: registry metadata for `@browserbasehq/cli`, `browse`, `@browserbasehq/stagehand`, `@browserbasehq/sdk`, `@browserbasehq/mcp`, and PyPI `stagehand`, `browserbase`.
