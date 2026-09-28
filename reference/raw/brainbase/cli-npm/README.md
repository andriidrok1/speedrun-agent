# brainbase

Pack, share, and install agent templates across harnesses (Claude Code, Codex, Kafka).

## Install

```sh
npm install -g @brainbase-labs/cli
```

The package installs a `brainbase` command on your PATH. Requires Node.js 18+.

## Quick start

```sh
brainbase login                 # connect this device to brainbase
brainbase team list             # which teams can I put agents in?
brainbase agent list            # which agents are in a team, and what are their ids?
brainbase template pack         # bundle the current agent into a template
brainbase template publish      # upload to the registry
brainbase template search       # find templates published by your team
brainbase template onboard <creator/slug>   # install or refresh a template
brainbase agent create          # claim a local brainbase.agent.yaml
brainbase task create --message "Review this project and propose next steps"
brainbase benchmark list        # list benchmarks for the linked agent
```

Run `brainbase help` to see every command.

## Task follow-ups

Send an instruction to an existing task, including while its agent is running:

```sh
brainbase task send <task-id> "Also update the Linear ticket"
brainbase task send <task-id> "Use the revised approach instead" --json
brainbase task stop <task-id>
```

`send` prints the input ID and generation to stderr before submitting and reports delivery
status in stdout. Initial acceptance can say **delivery pending** while the
server determines whether native steering is available. Native steering follows
the harness's own timing. A confirmed fallback says **queued for the next turn**.
`submitted` means the harness has received the input; it does not mean the agent
has acted on it. Multiple follow-ups can join one execution and receive one
combined answer.

By default, both commands read the current input generation before sending their request.
The credential must have receipt-read access as well as permission to send or stop.
Resource-scoped keys can lack that read access when task-read enforcement is enabled.
If the read fails, no mutation is sent. Use `--generation <n>` to bypass the read only
with a trusted current cutoff for a new operation, or the original cutoff for a retry.
A concurrent Stop prevents a send from joining newer work with an older generation.
If the HTTP response is lost or you press Ctrl-C, keep the input ID and generation,
and repeat the exact message with `--input-id <uuid> --generation <n>` to recover that request safely. Reusing an ID
does not replay an existing input. A **delivery unconfirmed** receipt means
the agent may already have received the instruction; deliberately resend
without `--input-id` only if you want to retry it as a new input.

Known pre-admission HTTP 503 refusals include `task_inputs_disabled`,
`task_input_recovery_unavailable`, and recognized sandbox provisioning or access
codes. These mean no input was admitted by that request. Retry the same ID, message
and generation after the service recovers. Unrecognized server or network failures
can leave delivery unconfirmed. A recovered receipt reports `idempotency_replayed: true`
in JSON when the server supplies its replay header.

`stop` stops execution and cancels pending follow-ups while retaining their
text. A new instruction will not replay them. Before submitting, it prints a retry
command with `--generation <n>`. Keep that command even if the response is lost:
retrying the original generation cannot interrupt newer work. An error can mean
queued inputs were already cancelled while the original execution is still running.
Follow the error's retry or operator-recovery guidance. Omit `--generation` only
when deliberately issuing a new Stop. JSON includes the original `expected_generation`
separately from the server's resulting `generation`.

Ctrl-C in `task create --wait`
or `task logs --follow` still only detaches; it does not stop remote work.
Both commands support `--json`. `send` exits 1 for unconfirmed, cancelled or
failed inputs, and for request errors. Other acknowledged states exit 0;
this confirms admission or delivery, not task success.

## Benchmark management

`benchmark init`, `benchmark validate`, and command help are local and need no
login or linked agent. Control-plane commands use the claimed agent in
`brainbase.agent.yaml` by default; pass `--agent <id>` to override it.

```sh
# Scaffold and validate locally.
brainbase benchmark init ./benchmarks/support-quality
brainbase benchmark validate ./benchmarks/support-quality

# Create accepts manifests and directories without attached files.
brainbase benchmark create ./benchmarks/support-quality --json

# A directory containing cases/*/files/** must be imported as a bundle.
brainbase benchmark import bundle ./benchmarks/support-quality --json

# Publish and run the resulting draft.
brainbase benchmark publish <benchmark-id> --expected-version <version> --json
brainbase benchmark run plan <benchmark-id> \
  --revision <revision-id> \
  --variant default \
  --json
brainbase benchmark run start <plan-id> --yes --json
brainbase benchmark run watch <run-id> --jsonl

# Inspect and export terminal results.
brainbase benchmark diagnoses <run-id> --json
brainbase benchmark export-results <run-id> --output ./results.zip
```

`benchmark pull` and `benchmark push` round-trip the local directory layout:

```text
benchmark.yaml
cases/<case-key>/case.yaml
cases/<case-key>/files/**
bundle/<original-bundle-path>
```

`benchmark.yaml` carries a local-only `case_order` list so pull and push
preserve case ordering; it is not sent as part of the remote manifest.
Case-local files stay beside their case. Shared, hidden, and root-level bundle
paths are stored below `bundle/` while retaining their original remote paths.
Pull destinations must be absent or empty. Use a new directory to refresh a
benchmark instead of overwriting local edits.

Human-readable output is the default. `--json` emits one versioned envelope.
For paginated commands, it returns one page and its `next_cursor` unless
`--all` is set. `--jsonl` emits item and page-boundary records, while watch
emits state-change events. Resume with `--cursor`; structured modes never
prompt.

Idempotency is explicit-only: requests omit the idempotency header unless
`--idempotency-key` is supplied. Reuse a key only for an identical retry.
Starting a run requires `--yes`; confirming the same plan ID is replay-safe.
Interrupting `run watch` does not cancel the remote run. A run that MAS pauses
for billing stops `run watch` with exit code 1; once billing is fixed, run
`brainbase benchmark run resume <run-id> --yes` to put it back in the queue.

Use `brainbase benchmark --help`, `brainbase benchmark run --help`, or
`brainbase benchmark <command> --help` for local command help.

## Benchmark runtime commands

Managed benchmark workers invoke two machine-only commands inside the same
sandbox as the agent task:

```sh
brainbase benchmark hydrate --spec /path/to/hydrate.json --result /path/to/result.json --json
brainbase benchmark evaluate --spec /path/to/evaluate.json --result /path/to/result.json --json
brainbase benchmark capabilities --json
```

The CLI executes local, versioned phase specifications. It does not claim work,
authorize users, or persist benchmark database state. The capabilities response
advertises both the CLI version and supported phase schema versions.

Both specs use `schema_version: "1"`, an `attempt_id`, a stable `phase_id`,
absolute workspace/staging/log paths, and a phase budget. Staging must be:

```text
<workspace>/.brainbase/benchmark/<attempt_id>/incoming
```

Phase log/test roots must be absent, empty, or carry the CLI's matching
attempt/phase ownership marker; the CLI never recursively clears an unowned
non-empty directory.

Hydration verifies every staged size and SHA-256 before copying a file or
safely extracting a gzip tar into the candidate workspace. `.brainbase`, `.git`,
and `brainbase.agent.yaml` are reserved. Setup commands use argv arrays, bounded
time/output, an allowlisted base environment, literal values explicitly marked
`sensitive: false`, and only command-selected secret environment variables from
the spec's declared bindings. Expected answers and evaluator definitions are
not valid hydrate fields.

Evaluation starts only after MAS has ended the agent turn and staged a separate
evaluation spec. It verifies final-output, trajectory, reference, and evaluator
bundle digests; writes a pre-evaluation workspace manifest; preserves declared
candidate artifacts; optionally creates a candidate archive; then materializes
hidden references outside the candidate workspace and runs evaluators
synchronously. Schema v1 supports:

- `output_assertion`: exact, contains, or regex checks over final output.
- `trajectory_assertion`: bounded counts of canonical event types.
- `workspace_assertion`: file existence, absence, SHA-256, or content checks.
- `sandbox_command`: a bounded argv command rooted in the workspace or hidden
  tests directory. Exit zero passes; any other exit code is a valid failed
  verdict. Schema v1 allows up to 20 command evaluators and runs them after all
  read-only assertions. Each command receives either the verified live workspace
  for legacy read-only evaluation or its own isolated frozen workspace copy.

Valid failed verdicts still produce a successful evaluation phase. Invalid
specs, digest/path violations, missing environment, phase-budget exhaustion,
and output-budget violations fail the phase. Individual command launch failures,
timeouts, and forced terminations are recorded as errored evaluator results so
the remaining evaluators can still run. Results are written atomically
with mode `0600`, include the raw spec digest and checksummed evidence/log
input/output references with explicit `staging`, `workspace`, `tests`, or
`logs` roots, redact declared secret values from command logs, require the
result path to be `<logs_root>/result.json`, and treat a matching successful
phase result as authoritative on replay.

On any phase-level execution failure, MAS must tear down the task sandbox.
Failed and timed-out commands clean up the process group and descendants the
CLI can observe. Successful evaluator commands receive the same cleanup so one
check cannot contaminate the next. Successful hydration setup commands may
intentionally leave services running for the agent turn; the runtime lifecycle
remains their final cleanup boundary. Isolated evaluator workspace copies omit
`.git` and unsafe absolute or escaping symlinks.

## Development

Build with the Bun version in `.bun-version` (currently 1.3.10) — CI and both
release workflows read that file. The generated `dist/index.js` is committed
and byte-checked in CI, and Bun patch releases can produce different bundle
output.

The suite is version-sensitive too, so the pin is enforced at each entry point:
`bun run verify` and `bun run build` refuse another Bun outright, and `bun test`
prints a warning and carries on. Each names the pinned version and the command
to get it: `npx bun@<pinned> …`. Use `npx` rather than `bunx` — bunx runs most
published Bun versions but cannot resolve a bin for 1.3.10 specifically, which
is the current pin. Set `SKIP_BUN_VERSION_CHECK=1` to override any of them.

### Releasing

1. Run **Prepare Release** from `main` with the exact version. It refuses a
   version already on npm, or a `release/*` branch or tag that already exists,
   then pushes the branch and prints a link to open the pull request. The org
   does not let Actions open pull requests, so that last step is yours.
2. Merge the release pull request. CI checks any pull request that moves the
   version, or comes from a `release/*` branch, against npm — so a hand-made
   release pull request is held to the same bar as a generated one.
3. Run **Publish**, naming the same version. It refuses to run if the commit
   it checked out declares a different one, and the tarball's `dist/index.js`
   must match the committed bundle.

Prepare and publish share a `release` concurrency group, so two releases queue
instead of interleaving. A published version is immutable: if a release goes
out without something you meant to include, ship the next version rather than
re-cutting the number.

## Agent runtime configuration

`brainbase.agent.yaml` can declare the provider and default model used by
managed runs:

```yaml
schema: 1
harness: codex
machine_kind: daytona
default_model: openai/gpt-5.6-terra

agent:
  name: Ops Agent
```

`machine_kind` is applied when the cloud agent is created. Changing it on a
claimed agent fails before any cloud writes; create a new agent to switch
providers. `default_model` can be changed with `brainbase agent push`; set it
to `null` to clear the override. Omitting either field leaves it unmanaged, so
older manifests keep their existing behavior.

## Feature support by harness

Each component type is stored in the place that harness already reads from at runtime — the CLI doesn't impose its own layout. "Native" cells describe where the install lands; "—" means the harness does not support that component type.

| Component | Claude Code | Codex | Kafka |
|---|---|---|---|
| **Skill** | `.claude/skills/<slug>/` (folder per skill, w/ provenance marker) | `~/.codex/skills/<slug>/` (global) or `.agents/skills/<slug>/` (project) | `.kafka/skills/<slug>/` |
| **MCP server** | Project: `.mcp.json`. Global: `~/.claude.json` → `mcpServers`. Never `settings.json` (Claude ignores it there). | Embedded in `~/.codex/config.toml` as `[mcp_servers.<slug>]` blocks | Embedded in `.kafka/kafka.json` (no sidecar — the Kafka SDK reads MCPs straight from settings) |
| **Command** (slash command / prompt) | `.claude/commands/<slug>.md` | `~/.codex/prompts/<slug>.md` (Codex has no documented project-scope prompts dir) | `.kafka/commands/<slug>.md` (the Kafka runtime calls these "playbooks" internally, but the CLI keeps the `command` type for cross-harness symmetry) |
| **Sub-agent** | `.claude/agents/<slug>.md` | — (Codex uses a different agent schema) | `.kafka/agents/<slug>.md` |
| **Playbook** | `.claude/playbooks/<slug>.md` + auto-managed table at the bottom of `CLAUDE.md` | `.codex/playbooks/<slug>.md` + auto-managed table at the bottom of `AGENTS.md` | `.kafka/playbooks/<slug>.md` + auto-managed table at the bottom of `KAFKA.md` |
| **Instruction** | Block in `CLAUDE.md` between `<!-- brainbase:start name=<template> -->` / `:end` markers | Same block convention in `AGENTS.md` | Same block convention in `KAFKA.md` |
| **Hook** | — (todo) | — | — |
| **File** | Arbitrary copy: single file or directory to a target path relative to `cwd` | Same | Same |

Playbook files carry a small YAML frontmatter (`title`, `description`) — the CLI parses it to build the table injected into each harness's instructions file. The table is bracketed by `<!-- brainbase:playbooks:start -->` / `:end` markers and regenerated on every pull, so removed playbooks drop out of the table automatically.

### Project root (harness-agnostic)

- Auto-detected `ONBOARDING.md` and any extra files/folders you point `--file <path>` at — packed as `file` components and replayed at install time.

## Configuration

| Variable | Purpose |
|-|-|
| `BRAINBASE_CONTROL_PLANE_URL` | Override the MAS host. Agent/orchestration requests use `/v2/cli`; task commands use `/v2/tasks`. The default is `https://api.brainbaselabs.com`. |
| `BRAINBASE_API_URL` | Legacy KLS host override. Control requests use `/api/cli`; it is also the fallback for model-proxy and registry traffic. |
| `BRAINBASE_PROXY_URL` | Override the model-proxy host used when enabling harness tracking. |
| `BRAINBASE_REGISTRY_URL` | Override the registry API host. |
| `BRAINBASE_TOKEN` | Use a PAT instead of the stored login session. The only way a PAT authenticates a control-plane command — see [Auth](#auth). |
| `BRAINBASE_HOME` | Where local state lives (default: `~/.brainbase`) |

Model-proxy and registry traffic fall back through `BRAINBASE_API_URL`,
the server captured at login, and finally `https://api.v1.brainbaselabs.com`.

## Auth

Three credentials, and which ones a command considers depends on the service
it talks to:

| Commands | Credentials tried, in order |
|-|-|
| `agent`, `orchestration`, `link`, `unlink`, `sync`, `status`, `team` | `BRAINBASE_TOKEN`, then the `auth.json` session |
| `template`, `skill`, `token` | `BRAINBASE_TOKEN`, then the session, then `token.json` |
| `task` commands | `BRAINBASE_TOKEN`, then the session, then `token.json` — the last only when no session is configured |
| `benchmark` control-plane commands | `BRAINBASE_TOKEN`, then the session |

`brainbase whoami` (or `--json`) reports which one is active.

**For CI:** `brainbase token create` saves the PAT to `~/.brainbase/token.json`,
and control-plane commands never read that file — `brainbase agent push` needs
the token in `BRAINBASE_TOKEN`:

```bash
export BRAINBASE_TOKEN=bbpat_…
brainbase agent push
```

Do not bake a `~/.brainbase` directory into a build image: a leftover
`auth.json` outranks the stored PAT, and every control-plane command starts
failing once its session expires.

An explicit PAT does not inherit routing from a stored login. Set
`BRAINBASE_CONTROL_PLANE_URL` when using a PAT against a non-default MAS host.

## License

MIT — see [LICENSE](./LICENSE).
