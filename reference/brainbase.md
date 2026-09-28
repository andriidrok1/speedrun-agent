# Brainbase reference for Creator Deals

Compiled 2026-09-28 for the Startup Speedrun Hackathon. Every claim points to a
file under `raw/brainbase/` or to a URL. Search-only facts are marked
**(search 2026-09-28, re-check)**. The docs sites (docs.brainbaselabs.com,
docs.usebrainbase.com, brainbaselabs.com) were blocked from this machine, so
anything that only lives there is either a search snippet or in the
"Unverified" list at the end. Source inventory: `raw/brainbase/SOURCES.md`.

---

## 0. TL;DR for the implementer

1. There are **two different Brainbase products** and the old SDKs point at
   the wrong one. Use the new one (app.brainbaselabs.com, "managed agents",
   CLI `@brainbase-labs/cli`, MCP at `https://api.brainbaselabs.com/mcp`).
   Ignore the Python SDK and the app template unless you want phone/SMS bots
   (section 1).
2. Fastest path: `npm install -g @brainbase-labs/cli`, `brainbase login`,
   write one `brainbase.agent.yaml` per side (brand agent, creator agent), list
   the tool MCP servers in its `mcp:` block, `brainbase agent create`, then
   drive runs with `brainbase task create` / `task send` or the same REST calls
   from our backend (sections 3 and 4).
3. Keep the money logic (budget cap, Stripe calls, "post is live" check) in
   **our own backend**, exposed to both Brainbase agents as one MCP server we
   host (for example on Cloudflare Workers, see `cloudflare-agents.md`). The
   agents negotiate; our server enforces rules and moves money (section 5).
4. Free tier is $25 of credits and model tokens come out of it; one
   third-party user reports the credits were **not** allocated on signup
   (HTTP 402 `CREDITS_EXHAUSTED`). Test a trivial task in the first 15 minutes
   and talk to the Brainbase booth if it fails (section 7).

---

## 1. What Brainbase is (and the two-product trap)

### 1a. Brainbase Labs platform (current, use this)

- "The official Brainbase MCP for any compatible MCP client ... Agent,
  component, eval, task, orchestration, schedule, template, and skill tools"
  (`raw/brainbase/brainbase-mcp/README.md`).
- Search: "the agentic operating system for your AI workforce ... onboard
  models, build agents, wire them into your tools, and supervise what they do
  from one control plane"; agents can be started "on a schedule, from a
  webhook, or through an integration" and get "3,000+ integrations, MCP
  servers, and custom functions" (https://docs.brainbaselabs.com/docs/welcome,
  **search 2026-09-28, re-check**; `raw/brainbase/web-search-notes.md`).
- Agents run on a **harness** (runtime). IDs the CLI knows include
  `claude-code`, `codex`, `kafka` (Brainbase's own), `qwen-code`, `opencode`,
  `openclaw`, `cursor`, `factory`, `qoder`; the CLI README table documents
  Claude Code, Codex and Kafka (`raw/brainbase/cli-npm/README.md`, "Feature
  support by harness"; harness list observed by a third party in
  `raw/brainbase/community-uap-harness/handoff.md`, "Found from the CLI").
- The MCP creates agents on `kafka_cloud` by default: "Unless the user
  selected another runtime ... omit `runtime_kind` and let the MCP apply the
  server-owned `kafka_cloud` default" (`raw/brainbase/brainbase-mcp/SKILL.md`,
  "Agent lifecycle").
- Each task runs in a sandbox machine. Default provider is Daytona
  (`machine_kind: daytona`) (`raw/brainbase/cli-npm/README.md`, "Agent
  runtime configuration"; https://www.daytona.io/dotfiles/brainbases-universal-harness-api-on-daytona,
  search). **Sandboxes bill until removed**: "machine rm <id> tear a sandbox
  down (it bills until you do)" (`raw/brainbase/cli-npm/dist-index-excerpts.js`,
  help text).

### 1b. Brainbase Conversational Platform (older, "Based" language)

- "The Brainbase Conversational Platform organizes work into teams, workers,
  flows, and deployments" (`raw/brainbase/mega/docs/platform.md`).
- A worker is an agent; a flow is a program in **Based**; deployments are
  channels: voice, chat, chat embed, SMS, WhatsApp, API
  (`raw/brainbase/mega/docs/deployments.md`).
- API base `https://brainbase-monorepo-api.onrender.com`, header
  `x-api-key: $BRAINBASE_API_KEY` (`raw/brainbase/mega/docs/api-reference.md`,
  "Defaults"); key comes from "the Brainbase dashboard under Settings > API
  Keys" (`raw/brainbase/mega/.env.example`).
- The Python SDK (`pip install brainbase-labs`) targets this older API:
  `client.workers.create/list/...`, `client.workers.flows.*`,
  `client.workers.deployments.voice.*`, auth header `x-api-key` from env
  `API_KEY`, base URL from `BRAINBASE_BASE_URL` (default `/api`)
  (`raw/brainbase/brainbase-python-sdk/api.md`, `_client.py` lines 81-120).
  Last commit 2025-02-04 (`raw/brainbase/SOURCES.md`).
- `brainbase-app-template` is a 2023 Flask + langchain 0.0.113 app
  (`raw/brainbase/brainbase-app-template/requirements.txt`, `app.py`). Not
  useful for this build.

**Decision for Creator Deals:** use 1a. Only reach for 1b if you want the
creator agent to answer a real phone number or WhatsApp.

---

## 2. Setup, step by step

### 2.1 Account and credits
1. Sign up at https://app.brainbaselabs.com ("$25 in free credits",
   https://brainbaselabs.com/blog/brainbase-is-now-ga, **search 2026-09-28,
   re-check**).
2. Immediately run a trivial task (2.3 step 6) to confirm credits exist. A
   third party on 2026-09-24 got `CREDITS_EXHAUSTED ... Used: 0, Allocated: 0
   (HTTP 402)` on a fresh account (`raw/brainbase/community-uap-harness/handoff.md`,
   "Smoke run 1").

### 2.2 Install the CLI
Quoted from `raw/brainbase/cli-npm/README.md`:

```sh
npm install -g @brainbase-labs/cli
```

"The package installs a `brainbase` command on your PATH. Requires Node.js 18+."
Beware name collisions: `brainbase`, `brainbase-sdk`, `brainbase-cli` on
npm/PyPI are unrelated (`raw/brainbase/community-uap-harness/handoff.md`, gap log).

### 2.3 Create an agent (CLI path)
Commands quoted from `raw/brainbase/cli-npm/README.md` "Quick start" and the
help text in `raw/brainbase/cli-npm/dist-index-excerpts.js`:

```sh
brainbase login                 # connect this device to brainbase
brainbase team list             # which teams can I put agents in?
brainbase agent init --full     # write a commented brainbase.agent.yaml (offline)
# edit brainbase.agent.yaml (see 2.4)
brainbase agent create          # claim the yaml and create the cloud agent (stamps id: into the file)
brainbase agent push            # after later edits
brainbase task create --message "..." --wait --timeout 300   # step 6: smoke test
brainbase task logs <task-id> --follow
brainbase machine ls            # then: brainbase machine rm <id>
```

Useful flags (help text): `--agent <id>`, `--title`, `--model <id>`, `--wait`,
`--timeout <secs>`, `--team <id>`, `--json`, `--yes`.

Login sessions expire about 15 minutes after `brainbase login`; for unattended
runs create a PAT with `brainbase token create` and export it as
`BRAINBASE_TOKEN` (`raw/brainbase/community-uap-harness/handoff.md`; the
README confirms `BRAINBASE_TOKEN` is "the only way a PAT authenticates a
control-plane command", `raw/brainbase/cli-npm/README.md`, "Auth").

### 2.4 The agent manifest: `brainbase.agent.yaml`
Verbatim template from the CLI (`raw/brainbase/cli-npm/dist-index-excerpts.js`,
lines 67856-67935 section). Only `schema` and `agent.name` are required.

```yaml
schema: 1
harness: claude-code
# machine_kind: daytona
# default_model: openai/gpt-5.6-terra
agent:
  name: ...
  tagline: ...
instructions:
  text: ...
  # file: ./.brainbase/instructions.md
# entrypoint:
#   commands:
#     - npm install
# playbooks:
#   - title: Release checklist
#     description: Steps to cut a release
#     content:
#       file: ./playbooks/release.md
# skills:
#   - source: registry:brainbase/changelog@1.0.0
#   - source: ./skills/local-linter
# MCP servers. Each entry needs either `url` or `command`. Keep tokens out
# of this file: put them in the gitignored `.brainbase/secrets.env`.
# mcp:
#   - name: github
#     url: https://api.githubcopilot.com/mcp/
#     is_enabled: true
# evals:
#   - slug: answered-the-question
#     criteria: The reply answers what was asked without inventing facts.
```

The MCP entry schema accepts `name`, `url`, `command`, `args`, `env`,
`headers`, `is_enabled`, `runtime_meta` (`McpEntrySchema`, same excerpt file,
lines 62580-62700 section). `capabilities` (memory, browser, slack, meeting,
github, linear) is pulled from the cloud and never pushed. `commands`,
`hooks`, `files` parse but `agent push` refuses them.

A real minimal manifest used by a third party
(`raw/brainbase/community-uap-harness/brainbase.agent.yaml`):

```yaml
schema: 1
harness: claude-code
agent:
  name: uap-smoke
  tagline: Smoke test for brainbase-uap-harness.
instructions:
  text: You are a concise coding agent. Do exactly what is asked, nothing more.
playbooks: []
skills: []
mcp: []
evals: []
```

### 2.5 Secrets
- Agent secrets live in `.brainbase/secrets.env` (gitignored, written by
  `brainbase agent pull`, synced by `brainbase agent push`); keys must match
  `^[A-Z][A-Z0-9_]*$` (`raw/brainbase/cli-npm/dist-index-excerpts.js`,
  `secrets-env.ts` section). `brainbase run <cmd>` runs a local command with
  those secrets in env (help text).
- Docs: "Store credentials as agent secrets instead of hard-coding them"
  (https://docs.brainbaselabs.com/docs/agent/tools, **search 2026-09-28,
  re-check**).
- Never paste keys into the yaml or chat; the MCP skill says "Never request,
  display, copy, log, or store raw secrets" and to use Brainbase's credential
  UI (`raw/brainbase/brainbase-mcp/SKILL.md`, "Credential and authorization
  boundary").

### 2.6 Env vars (CLI)
From `raw/brainbase/cli-npm/README.md` "Configuration" and the help text:

| Var | Meaning |
|---|---|
| `BRAINBASE_TOKEN` | PAT (`bbpat_...`) for non-interactive use |
| `BRAINBASE_CONTROL_PLANE_URL` | MAS host, default `https://api.brainbaselabs.com`; tasks under `/v2/tasks` |
| `BRAINBASE_HOME` | local state dir, default `~/.brainbase` |
| `BRAINBASE_NON_INTERACTIVE` | skip prompts (CI, agents) |
| `BRAINBASE_SLACK_BOT_TOKEN`, `BRAINBASE_SLACK_SIGNING_SECRET` | for `agent connect slack` |
| `BRAINBASE_API_URL`, `BRAINBASE_PROXY_URL`, `BRAINBASE_REGISTRY_URL` | legacy / proxy / registry overrides (default `https://api.v1.brainbaselabs.com`) |

Our own app env (suggested names, not from a source): `BRAINBASE_TOKEN`,
`BRAINBASE_BRAND_AGENT_ID`, `BRAINBASE_CREATOR_AGENT_ID`.

### 2.7 Brainbase MCP (manage Brainbase from Claude Code / Codex)
Quoted from `raw/brainbase/brainbase-mcp/README.md`:

```json
{
  "mcpServers": {
    "brainbase": {
      "type": "http",
      "url": "https://api.brainbaselabs.com/mcp"
    }
  }
}
```

"Do not add authorization headers or paste tokens into the configuration.
Complete Brainbase OAuth through the client when prompted." OAuth issuer is
`https://app.brainbaselabs.com`, scope `mcp:all`
(`raw/brainbase/brainbase-mcp/reference.md`, "Credential and capability rules").

Claude Code install (same README):

```sh
claude plugin marketplace add --scope user BrainbaseHQ/brainbase-mcp
claude plugin install --scope user brainbase-mcp@brainbase
```

This MCP is for **building/operating** agents (create agent, attach MCP
servers, start tasks). It is not the runtime channel between our app and the
agents. Tool inventory: `orgs_list, teams_list, agents_*, templates_*,
skills_*, mcp_servers_*, playbooks_*, evals_*, orchestrations_*,
orchestration_members_*, orchestration_edges_*, schedules_*, tasks_*,
instructions_update` (`raw/brainbase/brainbase-mcp/reference.md`, "Stable tool
inventory").

Create an agent via MCP (verbatim, same file, "Create an agent"):

```json
{
  "idempotency_key": "agent-support-triage-01",
  "title": "Support triage",
  "group_id": "resolved-group-uuid",
  "instructions": "Triage requests and propose the safest next action."
}
```

Attach a tool MCP server to an agent via MCP (verbatim, "MCP servers"):

```json
{
  "agent_id": "agent-uuid",
  "expected_revision": 1837462,
  "name": "ticketing",
  "url": "https://example.com/mcp",
  "is_enabled": true
}
```

"Do not send headers, environment values, tokens, or secrets" through this
tool; `has_headers` / `has_env` only indicate hidden config exists (same file).
So credentials for a tool MCP must be entered in the Brainbase UI or via
`.brainbase/secrets.env` + `agent push`, not through `mcp_servers_upsert`.

---

## 3. Driving tasks from our backend (REST, derived from the CLI source)

The CLI's task commands call the MAS control plane. From
`raw/brainbase/cli-npm/dist-index-excerpts.js` (sections 54278-54300,
54358-54370, 54698-54770, 80627-80680, 81236-81250):

- Base: `${BRAINBASE_CONTROL_PLANE_URL or https://api.brainbaselabs.com}/v2`
- Auth: `Authorization: Bearer <token>`, `Content-Type: application/json`
- Create: `POST /v2/tasks`, header `Idempotency-Key: <uuid>`, body

```js
const input = {
  agent_id: agentId,
  initial_messages: [{ role: "user", content: message }],
  auto_run: true,
  ...title ? { title } : {},
  ...model ? { default_model: model } : {}
};
```

- Status: `GET /v2/tasks/{id}`; list: `GET /v2/tasks?agent_id=...&limit=...`
- Transcript: `GET /v2/tasks/{id}/events?order_by_received=true&limit=...`;
  live: `/v2/tasks/{id}/events/stream`
- Follow-up turn: `POST /v2/tasks/{id}/inputs` with

```js
{
  input_id: inputId,
  messages: [{ role: "user", content: message }],
  expected_generation: expectedGeneration
}
```

  where `expected_generation` comes from
  `GET /v2/tasks/{id}/inputs?limit=1&include_messages=false` (`.generation`).
- Stop: `POST /v2/tasks/{id}/interrupt` with `{ expected_generation }`.
- CLI terminal statuses: `success`, `fail`, `need_more_info` (section
  80540-80552).

Same shapes appear in the MCP `tasks_create` / `tasks_followup` docs
(`raw/brainbase/brainbase-mcp/reference.md`, "Tasks"). The Brainbase MCP
marks `auto_run: true` and follow-ups with `run: true` as **billable**.

Minimal fetch (our code, built only from the shapes above):

```ts
const BASE = "https://api.brainbaselabs.com/v2";
async function startTask(agentId: string, msg: string) {
  const r = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.BRAINBASE_TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID()
    },
    body: JSON.stringify({
      agent_id: agentId,
      initial_messages: [{ role: "user", content: msg }],
      auto_run: true
    })
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json(); // { id, agent_id, status, ... }
}
```

Whether a PAT has the scopes for these endpoints: the CLI says task creation
can fail with "PAT lacks required scope: publish. Mint a replacement with
`brainbase token create --scopes read,publish`" (excerpt section 80627-80680).

---

## 4. Creator Deals on Brainbase: design

### 4.1 Two agents

| | Brand agent | Creator agent |
|---|---|---|
| Manifest | `agents/brand/brainbase.agent.yaml` | `agents/creator/brainbase.agent.yaml` |
| Instructions | budget, headcount, niche, flex %, deliverables, "never exceed cap", "use `deals.*` tools for any offer" | floor, refused categories, max deals/month, "escalate near edges" |
| Tool MCPs | `deals` (ours), Apify (discovery/scoring), optional Browserbase | `deals` (ours), Apify (own last 30 days) |
| Output | offers via `deals.propose_offer` | `deals.accept` / `deals.counter` / `deals.decline` |

Manifest sketch (fields from 2.4; URLs from sibling references; header values
stay out of the file):

```yaml
schema: 1
harness: claude-code
agent:
  name: creator-deals-brand
  tagline: Negotiates sponsorships for the brand within budget rules.
instructions:
  file: ./instructions.md
mcp:
  - name: deals
    url: https://<our-worker>.workers.dev/mcp
    is_enabled: true
  - name: apify
    url: https://mcp.apify.com?tools=actors,docs,apify/instagram-scraper,clockworks/tiktok-scraper
    is_enabled: true
```

Apify URL form and its `Authorization: Bearer <APIFY_TOKEN>` requirement:
`reference/apify.md` (section with `mcp.apify.com?tools=...`). Browserbase
hosted MCP: `https://mcp.browserbase.com/mcp` (`reference/browserbase.md`).
Stripe hosted MCP: `https://mcp.stripe.com`, OAuth (`reference/stripe.md`
section 2.3). **How a Brainbase agent supplies a bearer header to Apify's
MCP is unverified** (the schema has `headers`, but whether secret
interpolation like `${APIFY_TOKEN}` works is not documented in any source we
have). Safer: have our `deals` MCP call Apify and Stripe server-side with
keys held in our Worker secrets, so the Brainbase agents need only one MCP URL.

### 4.2 The negotiation loop (no Teams-tier features needed)

Built-in multi-agent orchestration is reported as Teams tier only
(`raw/brainbase/community-uap-harness/handoff.md`, "Free tier", third-party,
unverified). So relay messages ourselves:

1. Backend creates a deal row and starts brand task:
   `POST /v2/tasks` with the brief + creator stats (section 3).
2. Brand agent calls `deals.propose_offer({deal_id, price, deliverables})`
   on our MCP. Our server validates against the budget cap.
3. Our server starts (or follows up) the creator task with the offer text
   (`POST /v2/tasks` first time, then `POST /v2/tasks/{id}/inputs`).
4. Creator agent calls `deals.accept` / `deals.counter` / `deals.decline`.
5. Our server forwards counters to the brand task via `/inputs`. Loop until
   accept or a max round count.
6. On accept, our server (not the LLM) creates the Stripe Checkout /
   PaymentIntent, and later the Transfer after `deals.verify_post` passes
   (Stripe flow: `reference/stripe.md`).
7. Show the transcript by reading `GET /v2/tasks/{id}/events` for both tasks.

Why the relay: the agents stay pure negotiators, the hard rules (cap, floor,
refund on deadline) are code, and the demo transcript is ours to render.

### 4.3 Alternative: Brainbase orchestration graph
If the team tier is available at the event, the MCP supports agent-to-agent
edges and schedules: `orchestrations_create`, `orchestration_members_add`,
`orchestration_edges_upsert` with `{from_agent_id, to_agent_id, description,
payload_schema}` and `schedules_upsert` with `cron_expression`
(`raw/brainbase/brainbase-mcp/reference.md`, "Create and update an
orchestration", "Schedule trigger"). A schedule "creates a task for each
trigger edge and sends the edge description plus the trigger payload as the
initial user message" (https://docs.brainbaselabs.com/docs/agent/scheduled-agents,
**search 2026-09-28, re-check**). Use a schedule for the "post deadline
passed, refund" check if you go this way.

### 4.4 Channels (email, Slack)
- Surfaces are Chat, Slack, Phone, Meetings
  (https://docs.brainbaselabs.com/docs/agent/surfaces, **search 2026-09-28,
  re-check**). Email surface: a third party lists "surfaces
  (API/chat/Slack/Zoom/email)" from the GA blog
  (`raw/brainbase/community-uap-harness/handoff.md`); no primary source seen.
- Slack from the terminal: `brainbase agent connect slack` with
  `--bot-token` / `--signing-secret` (or the `BRAINBASE_SLACK_*` env vars)
  (help text in `raw/brainbase/cli-npm/dist-index-excerpts.js`).
- The brief says outreach email is drafted, not sent. Render the draft in our
  UI; no email surface needed.

### 4.5 Based (only if using the Conversational Platform)
Based is "Python with a small set of constructs": `loop:` / `until`,
`talk()`, `say()`, `.ask()`, `extract()`, `done()`
(`raw/brainbase/mega/docs/based.md`). Core pattern, verbatim:

```python
loop:
    res = talk("You are a helpful receptionist. Help the caller with their request.", False)
until "caller wants to schedule an appointment":
    say("Let me connect you with scheduling.")
until "caller wants to check order status":
    order_id = res.ask(question="What is the order ID?", example={"order_id": "ORD-12345"})
    # look up order, respond...
until "caller wants to end the conversation":
    say("Thanks for calling. Goodbye!")
```

Integrations inside Based: `await integrations.slack.send_message(...)`,
`await integrations.gmail.send_email(...)`; HTTP via `requests` wrapped in
`try/except` (same file). Test through the OpenAI-compatible engine at
`https://studio.brainbaselabs.com/v1/chat/completions?agent_id=<worker_id>&session_id=...`
with `Authorization: Bearer <engine_key>` and `x-brainbase-api-key`
(`raw/brainbase/mega/CLAUDE.md`, "Testing flows"). Examples:
`raw/brainbase/mega/examples/*.based`.

---

## 5. Where Stripe / Apify / Browserbase calls should live

| Call | Where | Why |
|---|---|---|
| Apify scrape (discovery, last 30 days) | Either agent via Apify MCP, or our `deals` MCP | Read-only, fine for the agent to drive |
| Pricing formula | our `deals` MCP (`price_creator`) | same number for both sides (brief: "shared pricing model") |
| Offer / counter / accept | our `deals` MCP | enforce budget cap and creator floor in code |
| Stripe Checkout, Connect onboarding, Transfer, Refund | our backend only | money must not depend on LLM tool choice; `reference/stripe.md` also recommends the SDK for the money flow |
| Post verification | our backend (Apify check of one URL) | it gates the Transfer |

---

## 6. Pricing

| Item | Value | Source |
|---|---|---|
| Free credits | $25 | https://brainbaselabs.com/blog/brainbase-is-now-ga (**search 2026-09-28, re-check**) |
| Free tier details | unlimited deployed agents, 20 concurrent sandboxes, 7-day retention, no card; no BYOK so model tokens use the credits | third-party quote of https://brainbaselabs.com/pricing in `raw/brainbase/community-uap-harness/handoff.md` (**unverified**) |
| Teams tier | $500/mo; multi-agent orchestration, custom evals | same third-party note (**unverified**) |
| Unit prices (per token, per sandbox minute) | not published | same note, gap log |
| Hackathon credits | organizers say credits for signups; amount not found | brief / ask on site |

Billable actions per the MCP skill: `tasks_create` with `auto_run: true`,
`tasks_followup` with `run: true`, `evals_run`, `schedules_test`
(`raw/brainbase/brainbase-mcp/SKILL.md`). Sandboxes bill until `machine rm`.

---

## 7. Gotchas

1. **Wrong API.** The Python SDK, app template and `mega` target the
   Conversational Platform (`x-api-key`, onrender.com host), not managed
   agents (`Bearer`, `api.brainbaselabs.com/v2`). Do not mix them (sections 1, 3).
2. **Credits may be 0 on a new account** (HTTP 402) (`community-uap-harness/handoff.md`).
3. **Login expires in about 15 min.** Use `BRAINBASE_TOKEN` for anything
   scripted (same file; `cli-npm/README.md` "Auth"). Do not bake
   `~/.brainbase` into an image: "a leftover `auth.json` outranks the stored
   PAT" (`cli-npm/README.md`).
4. **Harness is per agent, not per task.** `task create` has `--model` but no
   `--harness` (`community-uap-harness/handoff.md`; help text agrees).
5. **Harness id spelling differs**: API `kafka_cloud`/`claude_code` vs CLI
   `kafka`/`claude-code` (`community-uap-harness/handoff.md`;
   `brainbase-mcp/SKILL.md` uses `kafka_cloud`).
6. **`machine_kind` is immutable** after `agent create`
   (`cli-npm/README.md`, "Agent runtime configuration").
7. **Sandboxes bill until removed**: `brainbase machine ls` / `machine rm` at
   the end of the day.
8. **Ctrl-C does not stop remote work**: "Ctrl-C in `task create --wait` or
   `task logs --follow` still only detaches" (`cli-npm/README.md`).
9. **Follow-up delivery is async**: `submitted` "means the harness has
   received the input; it does not mean the agent has acted on it"
   (`cli-npm/README.md`, "Task follow-ups"). Poll events, do not assume.
10. **Idempotency keys**: required for `agents_create`, `tasks_create`,
    etc.; 8 to 200 chars; reuse only for identical retries
    (`brainbase-mcp/reference.md`).
11. **Revisions**: every MCP mutation needs the fresh `expected_revision`; on
    409 re-read and retry once (`brainbase-mcp/reference.md`).
12. **MCP server credentials cannot go through `mcp_servers_upsert`**
    (`brainbase-mcp/reference.md`, "MCP servers").
13. **No per-run token/cost in the API** per a third party; read credit
    balance before/after (`community-uap-harness/handoff.md`, gap log).

---

## 8. Unverified (check before relying on it)

- Exact current free-tier and Teams numbers (pricing page blocked; only a
  third-party quote).
- Whether hackathon signups get extra credits, and how many.
- Whether a PAT from `brainbase token create` can call `POST /v2/tasks`
  directly from a Worker (derived from CLI code, not from API docs).
- Exact JSON returned by `POST /v2/tasks` beyond `id`, `agent_id`, `status`.
- How to reference agent secrets inside an `mcp:` entry's `headers` (for
  Apify bearer tokens). Not documented in any source we hold.
- Whether a Brainbase agent can reach an arbitrary public MCP URL (ours on
  workers.dev) without allowlisting; the CLI mentions MCP traffic going
  "through the brainbase proxy" (`mcp check` help text) and the skill says
  "Inside a Brainbase task runtime, the CLI may route a credential-free
  remote MCP through the Brainbase proxy" (`brainbase-mcp/SKILL.md`).
- Email as an agent surface (only third-party mention).
- Which models are allowed on the free tier; model ids like
  `claude-opus-5-5`, `claude-sonnet-5` are listed at
  docs.brainbaselabs.com/docs/models per the third party only.
- Docs deep links in `brainbase-mcp/reference.md` "Interactive capability doc
  map" (tools, secrets, surfaces, external triggers) were not opened.
