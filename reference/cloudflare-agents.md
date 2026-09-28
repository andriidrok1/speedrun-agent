# Cloudflare Agents SDK reference for Creator Deals

Compiled 2026-09-28. Every claim points to a file under
`raw/cloudflare-agents/` or a URL. Source is the `cloudflare/agents` repo at
commit 11f87b5 (2026-09-28, package `agents` 0.24.0) and the
`cloudflare-docs` pricing/limits source files (`raw/cloudflare-agents/SOURCES.md`).
Search-only facts are marked **(search 2026-09-28, re-check)**.

---

## 0. TL;DR

- One `Negotiation` Agent (= one Durable Object) per deal, named by deal id.
  It holds the transcript, offer history, budget snapshot and deal status in
  its own SQLite, and schedules the "post deadline passed, refund" check.
- One `BrandBudget` Agent per brand holds the $20k cap and roster, so budget
  rebalancing is serialized in one place.
- Brand and creator "agents" can be two LLM personas called from inside the
  Negotiation DO (Claude via `@ai-sdk/anthropic`), or two Brainbase agents
  that the DO relays between (see `brainbase.md` section 4.2).
- The same Worker can also serve our `deals` MCP server (`createMcpHandler`),
  which is what Brainbase agents would call.
- Free plan is enough for the demo: 100,000 Worker requests/day and
  100,000 Durable Object requests/day, SQLite DOs only
  (`raw/cloudflare-agents/pricing/`). Watch the 50 subrequests per request
  limit on Free.

---

## 1. What it is

"Agents are persistent, stateful execution environments for agentic
workloads, powered by Cloudflare Durable Objects. Each agent has its own
state, storage, and lifecycle ... Agents hibernate when idle and wake on
demand ... each costs nothing when inactive." (`raw/cloudflare-agents/README.md`)

"Every agent is a Durable Object: an addressable, hibernatable actor with its
own SQLite database, WebSockets, and scheduling" (`raw/cloudflare-agents/docs/index.md`,
line 3, paraphrasing punctuation only).

Each unique name is its own instance: "`Counter:user-123` is separate from
`Counter:user-456`" (`raw/cloudflare-agents/docs/getting-started.md`, "Key
Concepts").

---

## 2. Setup

### 2.1 New project (quoted from `raw/cloudflare-agents/docs/getting-started.md`)

```bash
npm create cloudflare@latest -- --template cloudflare/agents-starter
cd my-agent
npm install
npm run dev        # http://localhost:5173
npm run deploy
```

Existing project: `npm install agents` (`raw/cloudflare-agents/README.md`).
For `@callable()` decorators you need `"extends": "agents/tsconfig"` in
tsconfig and the `agents()` Vite plugin (same file):

```typescript
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import agents from "agents/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [agents(), react(), cloudflare()]
});
```

In this repo, per `AGENTS.md`, do not run `npm run dev` directly from an agent
shell; that rule is for the Next.js site. A separate Worker project for
Creator Deals should still be started detached.

### 2.2 wrangler.jsonc (verbatim shape from getting-started.md)

```jsonc
{
  "name": "my-agent",
  "main": "src/server.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      {
        "name": "Counter",
        "class_name": "Counter"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["Counter"]
    }
  ]
}
```

For Creator Deals: bindings `Negotiation` and `BrandBudget`, both listed in
`new_sqlite_classes` (Free plan requires SQLite-backed DOs, see section 6).

### 2.3 Secrets and env

From `raw/cloudflare-agents/docs/configuration.md`, "Environment Variables &
Secrets": local secrets in a gitignored `.env`; production:

```bash
wrangler secret put OPENAI_API_KEY
wrangler secret list
wrangler secret delete OPENAI_API_KEY
```

Examples in the repo also use `.dev.vars` (e.g. `examples/deploy-churn/.dev.vars.example`
in the upstream repo holds `ANTHROPIC_API_KEY=`). Generate types with
`npx wrangler types env.d.ts --include-runtime false` (configuration.md).

Suggested secret names for us (our choice, not from a source):
`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY` (use a restricted `rk_test_...`,
see `reference/stripe.md`), `STRIPE_WEBHOOK_SECRET`, `APIFY_TOKEN`,
`BRAINBASE_TOKEN` (only if relaying to Brainbase).

---

## 3. Core APIs we need (quoted)

### 3.1 Agent, state, routing

```typescript
import { Agent, routeAgentRequest, callable } from "agents";

type CounterState = { count: number };

export class Counter extends Agent<Env, CounterState> {
  initialState: CounterState = { count: 0 };

  @callable()
  increment() {
    this.setState({ count: this.state.count + 1 });
    return this.state.count;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  }
};
```
(`raw/cloudflare-agents/docs/getting-started.md`)

- `setState()` saves to SQLite, broadcasts to all connected clients, then
  triggers `onStateChanged()`; state must be JSON-serializable, use ISO
  strings for dates (`raw/cloudflare-agents/docs/state.md`).
- `validateStateChange()` runs before persistence, must be synchronous,
  throwing aborts the update (state.md). Good place to reject a state that
  exceeds the budget.
- URL routing: `/agents/{kebab-class}/{instance-name}`, e.g.
  `/agents/negotiation/deal_123` (`raw/cloudflare-agents/docs/routing.md`).
- React client: `useAgent({ agent: "Negotiation", name: dealId })`, then
  `agent.state` and `agent.stub.method()` (getting-started.md; `name` option
  from the vanilla `AgentClient` example there).

### 3.2 SQL inside the agent

```ts
this.sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT)`;
this.sql`INSERT INTO users (id, name) VALUES (${userId}, ${userName})`;
const users = this.sql<{ id: string; name: string }>`SELECT * FROM users WHERE id = ${userId}`;
```
(`raw/cloudflare-agents/docs/agent-class.md`, "`this.sql`"; condensed to one
line each.) Synchronous API over `this.ctx.storage.sql`.

### 3.3 Agent-to-agent and Worker-to-agent calls

```typescript
import { getAgentByName } from "agents";

class OrchestratorAgent extends Agent {
  async delegateWork(taskId: string) {
    const worker = await getAgentByName(this.env.WorkerAgent, taskId);
    const result = await worker.doWork();
    return result;
  }
}
```
(`raw/cloudflare-agents/docs/callable-methods.md`, "Agent-to-Agent Calls".)
Direct DO RPC; no `@callable` needed for server-side calls. Each RPC method
call on a stub is billed as one DO request
(`raw/cloudflare-agents/pricing/partials__durable-objects__durable-objects-pricing.mdx`,
footnote 1).

### 3.4 Scheduling (deadline checks, refunds)

```typescript
await this.schedule(30, "sendReminder", { message: "Check your email" });            // seconds
await this.schedule(new Date("2025-02-01T09:00:00Z"), "sendReminder", { ... });     // at a time
await this.schedule("0 8 * * *", "dailyDigest", { userId });                         // cron
```
(`raw/cloudflare-agents/docs/scheduling.md`, "Quick Start", condensed.)
Signature: `schedule(when: Date | string | number, callback: keyof this,
payload?, options?: { retry?, idempotent? })`; "`number` (seconds delay),
`Date` (specific time), or `string` (cron expression)". Limits: payload up
to 2MB, cron minute precision (scheduling.md "API Reference", "Limits").
Other methods: `scheduleEvery`, `getScheduleById`, `listSchedules`,
`cancelSchedule`, `keepAlive`, `keepAliveWhile`.

### 3.5 Calling Claude inside an agent

```typescript
import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({ apiKey: this.env.ANTHROPIC_API_KEY });
const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  messages: await convertToModelMessages(this.messages)
});
```
(`raw/cloudflare-agents/docs/chat-agents.md`, "Anthropic", line ~1468.) That
snippet is for `AIChatAgent` (package `@cloudflare/ai-chat`). For our
server-to-server negotiation a plain `Agent` calling `generateText` from `ai`
with tools is enough. Model ids: check `claude-api` / Anthropic docs, the
id above is just what the doc shows.

### 3.6 MCP client (agent uses Stripe / Apify / Browserbase tools)

```sh
pnpm add agents @modelcontextprotocol/client@2.0.0
```

```typescript
const result = await this.addMcpServer("github", "https://mcp.github.com/mcp");
if (result.state === "authenticating") {
  return Response.redirect(result.authUrl);
}
```

Bearer auth (for Apify's `Authorization: Bearer <APIFY_TOKEN>`):

```typescript
await this.addMcpServer("internal", "https://internal-mcp.example.com/mcp", {
  transport: {
    headers: {
      Authorization: "Bearer my-token"
    }
  }
});
```

Use tools with the AI SDK: `tools: this.mcp.getAITools()`; discovery:
`this.mcp.listTools()`; server states `"ready" | "authenticating" |
"connecting" | "connected" | "discovering" | "failed"`
(all from `raw/cloudflare-agents/docs/mcp-client.md`). Connections persist in
the DO (mcp-client.md "Persistence").

Tool endpoints (from sibling references):
- Apify: `https://mcp.apify.com?tools=...` + `Authorization: Bearer` (`reference/apify.md`).
- Browserbase: `https://mcp.browserbase.com/mcp` (`reference/browserbase.md`).
- Stripe: `https://mcp.stripe.com`, OAuth (`reference/stripe.md` 2.3). OAuth
  from a headless DO means a redirect step (`result.authUrl`), so for the
  money flow call the Stripe SDK directly from the Worker instead
  (`reference/stripe.md` also recommends this).

### 3.7 MCP server (our `deals` tools, for Brainbase or any MCP client)

```sh
pnpm add agents @modelcontextprotocol/server@2.0.0 zod
```

```typescript
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

function createServer() {
  const server = new McpServer({ name: "Hello MCP Server", version: "1.0.0" });
  server.registerTool(
    "hello",
    { description: "Returns a greeting message", inputSchema: { name: z.string().optional() } },
    async ({ name }) => ({ content: [{ text: `Hello, ${name ?? "World"}!`, type: "text" }] })
  );
  return server;
}

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(createServer)(request, env, ctx);
  }
} satisfies ExportedHandler;
```
(`raw/cloudflare-agents/docs/mcp-servers.md`, condensed whitespace.)
Default route `/mcp`. `McpAgent` is now "deprecated legacy path ... New
servers should use `createMcpHandler()`" (same file). To combine with agent
routing in one Worker, check the path first and fall through to
`routeAgentRequest` (our composition, not a quoted pattern).

### 3.8 Human in the loop (creator escalation near the edges)

- Tool-level approval with AI SDK `needsApproval`, e.g.
  `needsApproval: async ({ amount }) => amount > 100`
  (`raw/cloudflare-agents/docs/human-in-the-loop.md`, "AI Tool Approval").
- Durable approval inside a Workflow: `await this.waitForApproval(step, {
  timeout: "7 days" })` (same file, "Workflow-Based Approval").
- Simple approach for the demo: set `status: "needs_human"` in state; the UI
  (subscribed via `useAgent`) shows Approve/Reject buttons calling a
  `@callable()` method (decision guide in the same file: "Use State +
  WebSocket for simple confirmations").

### 3.9 Email (optional; brief says outreach is drafted, not sent)

Requires a domain onboarded to Cloudflare Email Service, a `send_email`
binding and a routing rule (`raw/cloudflare-agents/docs/email.md`,
"Prerequisites"). Send with `this.sendEmail({ binding: this.env.EMAIL, to,
from, subject, text })`; receive with `onEmail(email)` and route with
`routeAgentEmail(message, env, { resolver: createAddressBasedEmailResolver("EmailAgent") })`
(email.md "Quick Start"). Skip for the 8-hour scope.

---

## 4. Creator Deals design on Cloudflare

### 4.1 Classes

| Class (DO) | Instance name | Holds | Methods (ours) |
|---|---|---|---|
| `BrandBudget` | `brand_<id>` | cap, flex %, roster, committed, spent | `reserve(dealId, amount)`, `release(dealId)`, `rebalance()` |
| `Negotiation` | `deal_<id>` | offers, transcript, status, Stripe ids, deadline | `start()`, `brandTurn()`, `creatorTurn()`, `onPaid()`, `verifyPost()`, `refundIfLate()` |

Flow (our design, using only the APIs above):

1. UI posts brand rules; Worker calls
   `getAgentByName(env.BrandBudget, brandId)` and stores them.
2. For each shortlisted creator, Worker calls
   `getAgentByName(env.Negotiation, dealId).start({...})`.
3. `start()` computes the fair price (shared formula from the brief), then
   alternates `brandTurn()` / `creatorTurn()`; each is one Claude call with a
   persona prompt and tools `propose_offer`, `accept`, `counter`, `decline`.
   Tool `execute` functions validate against rules in code:
   `BrandBudget.reserve()` for the cap, the creator floor for the other side.
4. Every turn `setState({...})` so the React transcript updates live.
5. On accept: create Stripe Checkout / PaymentIntent from the Worker
   (`reference/stripe.md`); Stripe webhook hits the Worker, which calls
   `Negotiation.onPaid()`.
6. `onPaid()` schedules `this.schedule(deadlineDate, "refundIfLate", {...})`.
7. "Post goes live": `verifyPost()` runs the Apify check; on pass, Stripe
   Transfer to the Connect account and `cancelSchedule` the refund.

If the agents are Brainbase agents instead, `brandTurn()` / `creatorTurn()`
become `POST /v2/tasks` / `POST /v2/tasks/{id}/inputs` calls, and the
Brainbase agents call back into our `deals` MCP (section 3.7) for offers
(`brainbase.md` section 4.2).

### 4.2 Why one DO per negotiation fits
- Single-threaded per instance, so two turns cannot race on the same deal
  (general DO property; the Agents docs describe each instance as an actor,
  `raw/cloudflare-agents/docs/index.md`).
- Idle deals hibernate and are not billed for duration: "Durable Objects that
  are idle and eligible for hibernation are not billed for duration"
  (`raw/cloudflare-agents/pricing/partials__durable-objects__durable-objects-pricing.mdx`).
- Scheduling gives the refund-on-deadline timer for free (section 3.4).

---

## 5. Examples worth opening

- `raw/cloudflare-agents/examples/mcp-client/` (agent as MCP client)
- `raw/cloudflare-agents/examples/mcp-server/`, `examples/mcp/` (serving MCP)
- `raw/cloudflare-agents/examples/agents-as-tools/` (agent calling agents)
- `raw/cloudflare-agents/examples/github-webhook/` (webhook into an agent; same shape as a Stripe webhook)
- `raw/cloudflare-agents/examples/workflows/`, `guides/human-in-the-loop/`
- `raw/cloudflare-agents/examples/email-agent/`
- `raw/cloudflare-agents/examples/x402/` (agent pays for an HTTP route with x402 on Base Sepolia; a different payment rail from Stripe, only as inspiration)
- `raw/cloudflare-agents/guides/anthropic-patterns/` ("The anthropic patterns, implemented with cloudflare agents", its `package.json` description)

---

## 6. Pricing and limits (docs source, fetched 2026-09-28 from cloudflare-docs on GitHub)

Workers (`raw/cloudflare-agents/pricing/docs__workers__platform__pricing.mdx`,
= https://developers.cloudflare.com/workers/platform/pricing/):

| | Free | Paid (Standard) |
|---|---|---|
| Subscription | $0 | $5/month minimum per account |
| Requests | 100,000 per day | 10 million/month included, +$0.30 per million |
| CPU time | 10 ms per invocation | 30 million CPU ms/month included, +$0.02 per million CPU ms; max 5 min per invocation (default 30 s) |
| Duration | no charge | no charge |

Durable Objects compute
(`raw/cloudflare-agents/pricing/partials__durable-objects__durable-objects-pricing.mdx`,
rendered on https://developers.cloudflare.com/durable-objects/platform/pricing/):

| | Free | Paid |
|---|---|---|
| Requests | 100,000 / day | 1 million / month, + $0.15/million (HTTP, RPC sessions, WebSocket messages at 20:1, alarms) |
| Duration | 13,000 GB-s / day | 400,000 GB-s / month, + $12.50/million GB-s |

SQLite storage (same file):

| | Free | Paid |
|---|---|---|
| Rows read | 5 million / day | 25 billion / month included, + $0.001 / million |
| Rows written | 100,000 / day | 50 million / month included, + $1.00 / million |
| Stored data | 5 GB total | 5 GB-month, + $0.20 / GB-month |

"Workers Free plan can only create and access SQLite-backed Durable
Objects" (same file). Each `setAlarm()` is billed as one row written (same
file), so every `schedule()` costs a row write.

Limits:
- Subrequests (fetch calls out of one invocation): 50 on Free, 10,000 on
  Paid (`raw/cloudflare-agents/pricing/docs__workers__platform__limits.mdx`,
  "Subrequests"). "Waiting on network requests ... does not count toward CPU
  time" (same file, "CPU time"), so waiting on Claude is cheap on CPU.
- Agents: max state per Agent 1 GB; compute 30 s, "refreshed per HTTP request
  / incoming WebSocket message"; wall clock per step unlimited
  (`raw/cloudflare-agents/pricing/docs__agents__platform__limits.mdx`).
- DO classes per account: 100 Free / 500 Paid; storage per DO 10 GB; Free
  account total 5 GB (`raw/cloudflare-agents/pricing/docs__durable-objects__platform__limits.mdx`).

Search-only extras (**search 2026-09-28, re-check**, see
`raw/cloudflare-agents/web-search-notes.md`): Workers AI $0.011 per 1,000
Neurons with 10,000 Neurons/day free; agent tracing free in beta and billed
under Workers Observability from 2026-10-01; SQLite storage billing started
Jan 2026 and Free plan users are not charged for it.

Demo estimate (ours): a few dozen deals x ~10 turns each is well under 1,000
DO requests, far inside the Free plan. The real cost is Claude tokens and
Apify runs, not Cloudflare.

---

## 7. Gotchas

1. **`schedule(number)` is seconds of delay, not a timestamp.** The
   human-in-the-loop doc's escalation example passes
   `Date.now() + 4 * 60 * 60 * 1000` as a number
   (`raw/cloudflare-agents/docs/human-in-the-loop.md`, "Escalation with
   Scheduling"), which per `scheduling.md` ("`number` (seconds delay)")
   would mean decades. Pass a `Date` for absolute times.
2. **`schedule()` in `onStart()` duplicates rows on every restart** unless
   `{ idempotent: true }` (scheduling.md).
3. **Do not mutate `this.state`**; call `setState()` (getting-started.md
   Troubleshooting).
4. **Decorators need the Vite plugin** and `agents/tsconfig`
   (getting-started.md).
5. **`McpAgent` is deprecated**; use `createMcpHandler()` with
   `@modelcontextprotocol/server@2.0.0` (mcp-servers.md). The MCP client
   needs `@modelcontextprotocol/client@2.0.0` exactly (mcp-client.md). Older
   tutorials show `McpAgent`.
6. **Stateless MCP handler cannot elicit/sample**: "attempts to sample,
   elicit, or list roots fail immediately" (mcp-servers.md).
7. **Free plan: 50 subrequests per invocation.** An Apify + Claude + Stripe
   turn is a handful; batch discovery over many creators should fan out
   across DO calls rather than loop inside one request (limits file).
8. **Migrations**: every new DO class needs a `migrations` entry with
   `new_sqlite_classes`; "Agent not found / 404" usually means missing export,
   binding or migration (getting-started.md Troubleshooting).
9. **Each DO RPC call is a billed request** (pricing partial, footnote 1).
10. **`accept()`-ed WebSockets without hibernation bill duration** the whole
    time they are open (pricing partial, footnote 4). The Agents SDK uses
    hibernation (README: "hibernate when idle"), but avoid custom raw
    WebSocket code.
11. **Stripe webhooks** need the raw body for signature checks; route
    `/api/stripe/webhook` before `routeAgentRequest` (our note; details in
    `reference/stripe.md`).

---

## 8. Unverified

- Whether Cloudflare Email Service sending works on the Free plan.
- Exact Anthropic model ids to use (doc example shows
  `claude-sonnet-4-20250514`; check the Anthropic model list).
- Whether the hosted Stripe MCP (OAuth) can be completed from a headless DO
  in the demo; plan on the Stripe SDK instead.
- Tracing billing from 2026-10-01 (search only).
- The `agents-starter` template contents today (not cloned; only the docs
  describe it).
- Hackathon-specific Cloudflare credits (not researched; ask organizers).
