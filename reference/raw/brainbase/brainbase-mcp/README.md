# Brainbase MCP

The official Brainbase MCP for any compatible MCP client.

Any compatible MCP client can connect to Brainbase over Streamable HTTP and
OAuth. This repository also includes optional Codex and Claude Code packages
that bundle the same MCP connection with a companion operating skill.

## What it provides

- A credential-free remote MCP connection to
  `https://api.brainbaselabs.com/mcp`
- Client-managed Brainbase OAuth with no pasted API keys or bearer tokens
- Agent, component, eval, task, orchestration, schedule, template, and skill
  tools for any compatible MCP client
- An optional maintained operating skill for clients that support packaged
  skills
- Revision-safe targeted writes, idempotent creates, destructive confirmation,
  and explicit billable-run guidance
- Optional Codex, Claude Code, and Brainbase package manifests

Workflows are intentionally excluded.

## Permissions and safety

Brainbase OAuth requests the `mcp:all` scope. This grants the client
user-wide access to Brainbase resources that the signed-in user can already
access under normal Brainbase permissions. It is not limited to one agent.

That means the MCP can:

- inspect and update agents, including an agent it is attached to;
- manage supported agent components, evals, orchestrations, and schedules;
- start tasks and eval runs that may consume paid Brainbase usage; and
- archive or delete supported resources after revision and name confirmation.

The package contains no tokens, secrets, credential headers, or environment
values. OAuth credentials remain in the installing client and Brainbase.

Inspect changes before approving them, especially operations marked billable or
destructive.

## Requirements

- A Brainbase account
- An MCP client with remote Streamable HTTP and OAuth support
- Permission to open `app.brainbaselabs.com` to complete OAuth

## Connect from any MCP client

Configure a remote HTTP MCP server named `brainbase` with this URL:

```text
https://api.brainbaselabs.com/mcp
```

For clients that accept an `mcpServers` object, adapt this credential-free
configuration:

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

Do not add authorization headers or paste tokens into the configuration.
Complete Brainbase OAuth through the client when prompted.

## Optional: install the Codex package

The Codex package installs the MCP connection and companion operating skill:

```sh
codex plugin marketplace add BrainbaseHQ/brainbase-mcp --ref main
codex plugin add brainbase-mcp@brainbase
```

Complete OAuth when Codex prompts during installation or first use, then start
a new thread.

Try:

> Use $brainbase-mcp to list my Brainbase agents and explain which one is safe
> to modify.

Remove it with:

```sh
codex plugin remove brainbase-mcp@brainbase
codex plugin marketplace remove brainbase
```

## Optional: install the Claude Code package

The Claude Code package installs the same MCP connection and operating skill:

```sh
claude plugin marketplace add --scope user BrainbaseHQ/brainbase-mcp
claude plugin install --scope user brainbase-mcp@brainbase
```

Complete OAuth when Claude Code prompts, restart Claude Code, and invoke a
Brainbase tool.

Remove it with:

```sh
claude plugin uninstall --scope user brainbase-mcp@brainbase
claude plugin marketplace remove --scope user brainbase
```

Removing the plugin removes its local configuration. If an OAuth credential may
have been exposed, report it through the private process in
[SECURITY.md](SECURITY.md).

## First-use workflow

1. List organizations and teams rather than guessing IDs.
2. Inspect an agent and obtain its current opaque revision.
3. Make one targeted change.
4. Read the resource back and verify the result.
5. Test behavior with a task or eval before deploying a schedule.

The companion skill applies this workflow automatically when installed.
Otherwise, follow the same sequence directly with the MCP tools.

## Capability boundaries

Directly supported operations include:

- Agent inspection, creation, updates, archive, and deletion
- Instructions, playbooks, registry skills, and MCP server configuration
- Eval lifecycle and result retrieval
- Orchestration members, edges, schedules, and trigger testing
- Task creation, follow-ups, interruption, and normalized events
- Registry template and skill discovery

Interactive or guided operations include secret entry, third-party OAuth,
browser credentials, memory administration, Slack, meetings, phone, and
external app triggers.

Arbitrary file CRUD, functions, modes, and legacy workflows are not exposed by
this MCP.

## Repository layout

- `.mcp.json` — shared credential-free remote MCP descriptor
- `.codex-plugin/` — Codex plugin metadata
- `.claude-plugin/` — Claude Code plugin and marketplace metadata
- `.agents/plugins/marketplace.json` — Codex marketplace metadata
- `skills/brainbase-mcp/` — maintained skill and reference material
- `components/mcps/brainbase/` — Brainbase package MCP component
- `brainbase.json` — optional Brainbase registry package manifest
- `scripts/validate.mjs` — dependency-free package validation

## Development

Run the repository validation:

```sh
node scripts/validate.mjs
```

Validate with Claude Code:

```sh
claude plugin validate --strict .
```

Test locally in Codex:

```sh
codex plugin marketplace add .
codex plugin add brainbase-mcp@brainbase
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing manifests or releasing a
new version.

## Versioning and releases

The package follows semantic versioning. A release updates the version in
`package.json`, both client plugin manifests, and `brainbase.json`.

When the skill or MCP component changes, regenerate the corresponding
`brainbase.json` checksum before release. Pull requests and `main` are validated
by GitHub Actions.

This repository is the canonical source for the Brainbase MCP distribution.
Any compatible MCP client can connect directly to the remote endpoint. The npm
package is intentionally disabled; optional Codex and Claude Code packages
install from this Git repository.

## Support

- Product documentation: <https://docs.brainbaselabs.com>
- Product website: <https://brainbaselabs.com>
- Bugs and feature requests:
  <https://github.com/BrainbaseHQ/brainbase-mcp/issues>
- Security reports: [SECURITY.md](SECURITY.md)

## License

[MIT](LICENSE)
