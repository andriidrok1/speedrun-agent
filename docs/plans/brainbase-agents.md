# Real agents on Brainbase (plan)

Research notes, 2026-09-28. Sources are in `reference/brainbase.md` and `reference/raw/brainbase/`.
Items marked **unverified** need a live check.

## Shape

Two Brainbase agents (brand, creator) on the `claude-code` harness with Claude. Our server drives
the turns over Brainbase REST. The agents act only through a `deals` MCP server we host, which
enforces the budget cap and the creator floor. The OpenAI path and the engine stay as fallbacks.

## Brainbase basics

- An agent is a stored config: harness, model, instructions, `mcp:` servers. Each task runs in its
  own sandbox (Daytona by default).
- Start a task: `POST https://api.brainbaselabs.com/v2/tasks` with `Authorization: Bearer <token>`,
  `Idempotency-Key`, body `{ agent_id, initial_messages: [{ role: "user", content }], auto_run: true }`.
  CLI: `brainbase task create --agent <id> --message ...`.
- Follow-up turn: `POST /v2/tasks/{id}/inputs` with `expected_generation` (CLI `task send`).
- Read output: poll `GET /v2/tasks/{id}` (terminal: `success | fail | need_more_info`) and
  `GET /v2/tasks/{id}/events` (`assistant.message`, `tool_call.start`, `tool_call.end`, `idle`).
- Model: `harness: claude-code`, `default_model: claude-sonnet-5` (**unverified** id format; try
  `anthropic/claude-sonnet-5` if rejected). Model tokens come out of the $25 free credits.

## Reachability

Hosted Brainbase only connects to **public HTTPS** MCP endpoints (no localhost). Options:

1. The Railway deploy, if it is live (stable URL).
2. `npx wrangler dev --port 8787 --tunnel` (trycloudflare URL, changes on restart, about 1 to 3 h).

## Server work

1. `server/src/mcp.ts`, mounted at `POST /mcp`: hand-rolled JSON-RPC (`initialize`, `tools/list`,
   `tools/call`). Tools, each keyed by `deal_id` + a per-turn `turn_key`:
   - `get_creator_stats` -> the `Creator` shape
   - `get_rules` -> only the caller's own rules (brand: cap, barter menu; creator: floor, premiums)
   - `propose_offer` -> runs the existing referee; `REJECTED. <reason>` makes the agent retry
   - `accept`
2. `DealDO`: a pending-turn slot plus an `mcpCall(tool, args)` RPC that resolves it.
3. `server/src/agents/brainbase.ts`: same loop as `runNegotiationLLM`; each move sends the turn,
   waits up to 150 s for the tool call, else uses the engine's offer.
4. `LLM_MODE=brainbase` selects it. New vars: `BRAINBASE_TOKEN`, `BRAINBASE_BRAND_AGENT_ID`,
   `BRAINBASE_CREATOR_AGENT_ID`.

## Agent configs

`agents/brand/brainbase.agent.yaml`:

```yaml
schema: 1
harness: claude-code
default_model: claude-sonnet-5
agent:
  name: creator-deals-brand
  tagline: Negotiates creator sponsorships for the brand within budget.
instructions:
  text: |
    You negotiate for the brand. Each message has a deal_id, a turn_key and the offers so far.
    Act only through the deals tools. Never use the shell, files or web.
    Optionally call deals.get_rules and deals.get_creator_stats, then make exactly one
    deals.propose_offer or deals.accept call. If it returns REJECTED, fix it and call again.
    After an ok result, reply with one short sentence and stop.
mcp:
  - name: deals
    url: https://PUBLIC_HOST/mcp
    is_enabled: true
```

`agents/creator/brainbase.agent.yaml`: same, with "You negotiate for the creator" and
"Never go below your floor from deals.get_rules."

## Check first (credits)

1. `brainbase whoami`, `brainbase team list`
2. One trivial `task create --wait --timeout 120`
3. HTTP 402 `CREDITS_EXHAUSTED` has been reported on fresh accounts: go to the Brainbase booth.
4. At the end: `brainbase machine ls` / `machine rm` (sandboxes bill until removed).

## Demo risks

1. No credits or slow turns (latency is **unknown**): time the smoke test; cap at 3 rounds; keep a
   saved Brainbase transcript to show and run the engine live if it is too slow.
2. Public URL dies: start the tunnel once, after 14:30; curl `/mcp` before going on stage.
3. Agent never calls the tool: the 150 s timeout falls back to the engine's offer.

Fallbacks: `LLM_MODE` unset = OpenAI path, `LLM_MODE=off` = deterministic engine.
