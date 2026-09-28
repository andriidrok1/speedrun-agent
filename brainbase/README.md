# Brainbase brand manager agent

One Brainbase-hosted agent (`creator-deals-brand-manager`) that drives the deals server through its MCP endpoint (`POST /mcp` on the Railway API). Each `start_deal` it makes spins up a negotiation between two LLM agents inside the Worker, so a single task shows an autonomous org: manager agent on Brainbase, negotiators in the Worker, money and verification in our backend.

Files:

- `brainbase.agent.yaml`: manifest (harness `claude-code`, `mcp:` block pointing at `https://api-production-4aa5.up.railway.app/mcp`)
- `instructions.md`: the agent's system instructions (procedure + report format)

## Create / update

```sh
export BRAINBASE_TOKEN=...          # PAT, same value as BRAINBASE_API_KEY in server/.dev.vars
cd brainbase
npx -y @brainbase-labs/cli@latest agent create --yes   # first time; stamps id: into the yaml
npx -y @brainbase-labs/cli@latest agent push           # after edits
```

## Run a campaign

```sh
npx -y @brainbase-labs/cli@latest task create \
  --message "Run the Marine Layer fall campaign: budget 50000, negotiate with maya-wears, fund the deal, verify with mock, report." \
  --wait --timeout 400 --json
```

Transcript: `GET https://api.brainbaselabs.com/v2/tasks/<id>/events?order_by_received=true&limit=200` with `Authorization: Bearer $BRAINBASE_TOKEN`.

## MCP tools the agent sees

`list_brands`, `list_creators`, `create_campaign`, `campaign_status`, `start_deal`, `get_deal`, `wait_for_deal` (polls every 3 s, max 240 s), `fund_deal`, `verify_post`, `expire_deal`. Source: `server/src/mcp.ts`. Optional bearer auth: set `MCP_TOKEN` on the server and add a `headers: { Authorization: Bearer ... }` entry to the `mcp:` block (keep the value in `.brainbase/secrets.env`).
