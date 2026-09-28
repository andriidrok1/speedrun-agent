# 01 first-uap-agent — handoff
> Updated: 2026-09-24 · Status: pickup-ready · Born from a discussion session (no code yet)

## Goal
1. Package **doruk-ai-harness** (`~/Dev/Personal-Projects/doruk-ai-harness`,
   public at github.com/doruktarhan/doruk-ai-harness) as a **UAP agent** (one YAML).
2. Run the **same task** (`tasks/fantasy-draft-board.md`) on **3 harnesses** via Brainbase's
   Universal Managed Agents API, switching only the `harness` field. Use the newest models they
   allow.
3. Publish a comparison (cost, time, quality) in `results/`.
4. **Find the gaps**: what UAP / the API can't express or does badly (e.g. skills packaging), and
   turn real ones into upstream issues/PRs. Doruk explicitly likes this angle: gaps are the product.

Done = UAP file in `uap/`, 3 completed runs with outputs + a filled comparison table in `results/`,
a gap log with repros, README updated with findings.

## What Brainbase is (researched 2026-09-23)
YC company (founded 2024, solo founder Gökhan Eğri). Tagline: "building the primitives for the next
1B agents" / "the first AI agent cloud". Sells infrastructure for enterprises' internal agents.

**1. Brainbase platform (GA)** — managed cloud for running fleets of agents. Primitives: harnesses
(multiple runtimes), router (picks model by price/performance/latency, 50+ models), registry
(versioned agents/skills/tools), auth, permissions (scoped actions, audit trail), orchestration,
surfaces (API/chat/Slack/Zoom/email), sandboxes, evals ("every change scored before it ships"),
observability. Deploy: managed cloud, private cloud (AWS/Azure/GCP), on-prem, hybrid. Named users:
government, Fortune 500, frontier labs, Toyota, NBC, Fal.
→ https://brainbaselabs.com/blog/brainbase-is-now-ga

**2. Universal Managed Agents API** — one API to run an agent on 8 harnesses at launch: Kafka (their
own), Claude Code, Codex, Cursor, Factory Droid, OpenCode, Qoder, Qwen Code. Switch runtime with a
single `harness` field. Every thread runs on its own sandbox machine (filesystem, shell, network).
Any model provider (OpenAI, Anthropic, Google, xAI) + open weights, per request. Managed auth:
secrets planted into the sandbox at creation. Their pitch: "pairings that used to take an
integration… now a one-line change"; "Managed agents made agents feel like a resource instead of a
project. Universal Managed Agents makes that resource universal." Demo workflows include harness
comparison (= exactly what we're doing).
→ https://brainbaselabs.com/blog/universal-managed-agents

**3. Universal Agent Protocol (UAP)** — open-source (Apache-2.0) "open format that defines an agent
in a single YAML document, installable into any supported coding harness". Declares instructions,
MCP servers, skills, permissions, secrets, harness-independent. Tagline: "No more walled gardens."
→ https://universalagentprotocol.io

## Free tier (pricing page, 2026-09-23)
- **$25 credits**, unlimited deployed agents, **20 concurrent sandboxes**, 7-day data retention,
  versioning + observability + community support, self-serve, no card.
- **NOT on free:** BYOK (so model tokens burn the $25), multi-agent orchestration, custom evals
  (unit/regression/LLM-as-judge are Teams tier, $500/mo), full RBAC.
- API access via the Managed Agents API on all tiers.
→ https://brainbaselabs.com/pricing

## Setup (Doruk does this himself)
Their guided setup: `npm install` the brainbase package, then `brainbase help`. Doruk runs signup /
auth / install; ask him to paste what the CLI prints. API key → `.env` (gitignored), never commit.

## Open questions (answer these first, from docs + the CLI)
1. How does UAP represent **skills**? doruk-ai-harness skills are `SKILL.md` folders with
   frontmatter (Claude Code format). Does UAP carry them to Codex/OpenCode, or only to Claude Code?
   (Likeliest first gap.)
2. Which harnesses and models does the **free tier** actually allow? Is the newest frontier model
   available on each harness?
3. **Credit burn rate**: what does one short run cost? Budget 3 final runs + some iteration within
   $25; use a cheap model for iteration.
4. How do outputs come back out of the sandbox (files, git push, artifact download)?
5. Does observability expose per-run tokens/cost we can put in the comparison?

## Answers from docs (2026-09-24; C = confirmed, P = partial, ? = must try the CLI)
1. **Skills (P):** UAP file is `agent.uap.yaml`: `skills: [{source: ./uap/skills/<name>}]` (dirs with
   `SKILL.md`), `instructions: [{activation: always|auto|manual, content: {file: ...}}]`,
   `mcp_servers`, `secrets` (`${NAME}`), `permissions {allow, deny}`, `hooks`, `setup`, `subagents`,
   `commands`. Harness matrix (universalagentprotocol.io/docs/harnesses): Claude Code = native
   reference; OpenCode = "everything core maps natively"; Codex = skills via the cross-tool `.agents`
   standard. Could not verify against source (spec repo 404s, see gap log).
2. **Harnesses/models (P):** API ids `claude_code, codex, cursor, factory, kafka_cloud, opencode,
   qoder, qwen`. Models listed at docs.brainbaselabs.com/docs/models (e.g. `claude-opus-5-5`,
   `claude-sonnet-5`, `gpt-6-sol`, `gemini-3.8-flash`). Free-tier restrictions: ?
3. **Credit burn (?):** no per-token markup or sandbox-minute rate published. Smoke run measures it.
4. **Outputs (C shape):** files API `/v2/files/list`, `/download-file`, `/upload-file`, plus a
   machine preview API for live ports. Git push from sandbox with a planted secret: ?
5. **Per-run tokens/cost (?, leaning no):** monitoring docs show status/timeline/detail only.
   Fallback: read the credit balance before/after each run.
6. **Blending harnesses:** built-in multi-agent orchestration + hand-offs are **Teams tier only (C)**.
   Manual chaining (thread A's files → thread B's input via files API + `/v2/tasks/{id}/inputs`)
   looks possible on free tier: ?. **Parked** until the core plan is done.
7. **Setup (P):** `npm install -g @brainbase-labs/cli` (v0.36.0), `brainbase login` (browser) or a
   PAT for CI (env var name ?). Create-agent-from-YAML + start-run commands: ? (read `brainbase help`).

## Found from the CLI (v0.36.0, 2026-09-24 01:30)
- Brainbase's CLI manifest is **`brainbase.agent.yaml`** (`brainbase agent init --full` shows every
  block), NOT UAP's `agent.uap.yaml`. Blocks: `schema, harness, machine_kind, default_model, agent,
  instructions {text|file}, entrypoint, playbooks, skills [{source: ./dir | registry:x@v}], mcp,
  evals`. `commands/hooks/files` parse but `agent push` refuses them.
- **Harness is per agent, not per task.** `task create` takes `--model` but no `--harness`. So one
  agent per harness (3 folders under `uap/`), or edit `harness:` + `agent push` between runs.
- Harness ids here are `claude-code, codex, kafka, qwen-code, opencode, openclaw, cursor, factory,
  qoder`; `brainbase help` lists only claude-code / codex / kafka with full feature support.
- Run loop: `agent create --team <id>` (stamps `id:` into the yaml) → `task create --agent <id>
  --message ... --model <id> --wait --timeout N` → `task get` / `task logs` → `machine ls` /
  `machine rm` (sandboxes **bill until removed**).
- Team: `f14433b9-ac51-4945-b2df-eccdafbb8759` ("General"). Smoke agent: `uap/smoke/`, id
  `0c5a19ca-90f1-4019-a1da-680d98999ff8`.
- Login session expires ~15 min after `brainbase login`. Unattended runs need `brainbase token
  create` → `BRAINBASE_TOKEN` in `.env`.
- **Smoke run 1 (task 4fb0e338…): failed with `CREDITS_EXHAUSTED ... Used: 0, Allocated: 0 (HTTP
  402)`.** The advertised $25 is not on the account. BLOCKER until Doruk fixes billing.

## Plan (suggested, adjust after the open questions)
1. Read UAP spec + Managed Agents API docs; answer Q1–Q5 → note here.
2. Write `uap/doruk-harness.yaml`: pick a small subset of the harness (e.g. `discuss`,
   `lean-instructions`, a workflow skill) rather than all of it.
3. One cheap smoke run on one harness with a trivial task.
4. Three real runs of `tasks/fantasy-draft-board.md` (e.g. Claude Code, Codex, OpenCode).
5. Score per the task file; fill `results/comparison.md`; gap log → issues/PRs upstream.

## Reference material
- Doruk's original fantasy tool (private data, don't copy data): `~/Dev/Personal-Projects/fantasy-draft-tool`
  (merge.py + index.html; Yahoo rank + 7-day ADP + Hashtag, starred shortlist, drafted+undo, HT edge).
  The task spec is derived from it; use **mock data only** here.

## Gap log
_(what · repro · harness · severity · upstream link)_
- **UAP spec repo not public.** universalagentprotocol.io links `github.com/BrainbaseHQ/uap` as the
  spec/adapters source; `gh api repos/BrainbaseHQ/uap` → 404 (2026-09-24). "Open format, Apache-2.0"
  but the schema can't be checked against source. · all · high (credibility) · —
- **No published unit pricing.** Neither /pricing nor the API docs give per-token markup or
  sandbox-time rates; cost is only discoverable by burning credits. · all · medium · —
- **No per-run tokens/cost in monitoring or the API** (docs/monitoring/tasks: status/timeline/detail
  only). Harness comparisons, their own headline use case, need this. · all · medium · —
- **Inconsistent model id format:** bare `claude-sonnet-5` vs namespaced `meta/muse-spark-1.3`. · —
  · low · —
- **Free credits not allocated on signup.** Fresh account, first task → `CREDITS_EXHAUSTED ...
  Used: 0, Allocated: 0 (HTTP 402)`; the pricing page promises $25. Repro: sign up, `agent create`,
  `task create --wait`. · all · high (blocks the first run) · —
- **UAP vs Brainbase manifest split.** universalagentprotocol.io documents `agent.uap.yaml`; the
  Brainbase CLI only knows `brainbase.agent.yaml` with a different schema. Which is canonical? · all
  · high · —
- **Harness can't be picked per task.** The blog pitches "switch runtime with one `harness` field"
  per request, but `task create` has no `--harness`; it's baked into the agent. · all · medium · —
- **Harness id spelling differs:** API `claude_code` / `qwen` vs CLI `claude-code` / `qwen-code`.
  · all · low · —
- **`commands`/`hooks`/`files` parse but can't be pushed** (manifest comment). · all · medium · —
- **Name collision on npm/PyPI:** `brainbase`, `brainbase-sdk`, `brainbase-cli` belong to an
  unrelated product; the real one is `@brainbase-labs/cli`. · setup · low · —
