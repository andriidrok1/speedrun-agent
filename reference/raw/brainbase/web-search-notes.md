# Brainbase: web search snippets

Fetched via the WebSearch tool on 2026-09-28. These are search-engine
summaries of pages that could not be opened directly (egress blocked).
Treat every line as "fetched via search on 2026-09-28, re-check".

## What Brainbase is
- "Brainbase is the agentic operating system for your AI workforce that lets you onboard models, build agents, wire them into your tools, and supervise what they do from one control plane." Source: https://docs.brainbaselabs.com/docs/welcome
- "You can set up your project and ship your first trigger-driven agent in a few minutes." Source: https://docs.brainbaselabs.com/docs/welcome
- Run agents from phone calls, Zoom meetings, Slack, chat; kick off tasks on a schedule, from a webhook, or through an integration; 3,000+ integrations, MCP servers, and custom functions. Source: https://docs.brainbaselabs.com/docs/welcome
- "Brainbase is the first AI agent cloud ... deploy and orchestrate thousands of cloud agents across models and harnesses ... sandboxing, routing, permissions, evals, monitoring, and deployment." Source: https://brainbaselabs.com/blog/brainbase-is-now-ga

## Pricing / credits
- "You can try Brainbase at app.brainbaselabs.com with $25 in free credits." Source: https://brainbaselabs.com/blog/brainbase-is-now-ga
- "No public pricing tiers were detected" (third-party scrape). Source: https://webclaw.io/data/startups/company/brainbaselabs.com
- A third-party developer's notes (2026-09-23) quote https://brainbaselabs.com/pricing as: $25 credits, unlimited deployed agents, 20 concurrent sandboxes, 7-day data retention, no card; not on free: BYOK, multi-agent orchestration, custom evals (Teams tier, $500/mo). See `community-uap-harness/handoff.md`. The pricing page itself was not reachable here.

## Tools, integrations, secrets
- "Tools let an agent take action outside the conversation by connecting the agent to SaaS integrations, MCP servers, and custom functions so it can read data, update systems, and run controlled operations." Source: https://docs.brainbaselabs.com/docs/agent/tools
- "Use integrations for broad OAuth access and MCP servers for specialized systems or precise data shapes." Source: https://docs.brainbaselabs.com/docs/agent/tools
- "Store credentials as agent secrets instead of hard-coding them in function code." Source: https://docs.brainbaselabs.com/docs/agent/tools

## Surfaces (channels)
- Surfaces: Chat (web app), Slack (channels, mentions, DMs), Phone (inbound calls from approved callers), Meetings (join, take notes, follow up). Source: https://docs.brainbaselabs.com/docs/agent/surfaces
- Slack: "create a Slack app from the manifest Brainbase generates, install it into your workspace, then save the credentials back on the agent." Source: https://docs.brainbaselabs.com/docs/agent/surfaces
- A press item mentions "AI Employees with Email, Phone & Slack" (Kafka Workforce). Source: https://www.stocktitan.net/news/AMZN/brainbase-labs-leverages-aws-to-launch-kafka-workforce-a-highly-78176doza23m.html

## Triggers and schedules
- "A schedule is a trigger node on an orchestration, and when it fires, Brainbase creates a task for each trigger edge and sends the edge description plus the trigger payload as the initial user message." Source: https://docs.brainbaselabs.com/docs/agent/scheduled-agents
- Cron is standard five-field; convert local time to UTC before writing `cron_expression`; per-schedule config goes in trigger `configured_props`. Source: https://docs.brainbaselabs.com/docs/agent/scheduled-agents
- "kick agents off from any event: webhooks, schedules, or 1000+ app triggers like Linear, Slack, and GitHub." Source: https://brainbaselabs.com/

## Universal Harness / Managed Agents API
- "Brainbase's Universal Harness API collapses multiple agent frameworks into one endpoint, with a single payload describing an agent (its harness, instructions, model, and tools) and starting it running in an isolated sandbox." Daytona is the default sandbox; `machine_kind: "daytona"` is the default. "The API also accepts optional mcp_servers, secrets, and skills." Source: https://www.daytona.io/dotfiles/brainbases-universal-harness-api-on-daytona

## Based language (legacy Conversational Platform)
- "Based is a high-level AI instruction language crafted to design dynamic conversational agents that operate flawlessly across multiple communication channels." Source: https://docs.usebrainbase.com/introduction

## Hackathon credits
- No search result described hackathon-specific Brainbase credits for the Sept 28 2026 event. Ask the organizers on site.
