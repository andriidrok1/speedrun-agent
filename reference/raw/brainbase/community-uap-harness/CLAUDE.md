# brainbase-uap-harness

Public showcase repo: doruk-ai-harness packaged as a UAP agent, run across harnesses on Brainbase.

## Session start
Read `.doruk/STATE.md`, then the active feature's `handoff.md`. It holds everything known about
Brainbase (products, free-tier limits, links, open questions). Also read `.local/context.md` if it
exists (private, gitignored: why this project exists).

## Rules
- **PUBLIC repo.** Never commit secrets (Brainbase API key lives in `.env`, gitignored), personal
  context, or anything from `~/Dev/Personal-Projects/mnemos` or `job-search-ultimate`. Private notes
  go in `.local/` (gitignored).
- **Simplicity first.** Their CLI/API + a few files before any custom framework.
- **Budget:** free tier = $25 credits total, and model tokens come out of it (no BYOK). Prefer short
  tasks and cheaper models for iteration; save the frontier-model runs for the final comparison. Log
  credit use per run in `results/`.
- **Doruk runs the Brainbase setup himself** (`npm install` + `brainbase help` + signup/auth).
  Don't script around auth; ask him for what the CLI printed.
- **Gaps are the product.** Every friction point with UAP / the API goes in the handoff's gap log
  with a repro, same session.
