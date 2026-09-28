# brainbase-uap-harness

**One harness definition, many runtimes.** This repo packages
[doruk-ai-harness](https://github.com/doruktarhan/doruk-ai-harness) (a Claude Code harness of
skills + conventions) as a [Universal Agent Protocol](https://universalagentprotocol.io) agent, and
runs it on several coding harnesses (Claude Code, Codex, OpenCode, …) through
[Brainbase](https://brainbaselabs.com)'s Universal Managed Agents API.

The test task: build the same small app (a fantasy-basketball draft board) with each harness, then
compare cost, time, and quality side by side. Along the way, record every gap found in UAP / the
Managed Agents API, and turn the real ones into issues or PRs upstream.

## Status
Work in progress. See `results/` for runs as they land.

## Layout
- `uap/` — the UAP agent definition(s) for the harness
- `tasks/` — the fixed task spec every harness gets
- `results/` — per-run outputs + the comparison
