# Cloudflare: web search snippets

Fetched via the WebSearch tool on 2026-09-28. Treat each line as
"fetched via search on 2026-09-28, re-check". Where a number conflicts with
the docs source in `pricing/`, the docs source wins.

- Workers Free: 100,000 requests per day, 10 ms CPU per invocation. Workers Paid: $5/month, 10 million requests and 30 million CPU ms included, $0.30 per extra million requests, $0.02 per extra million CPU ms. Sources: https://developers.cloudflare.com/workers/platform/pricing/ , https://www.cloudflare.com/plans/developer-platform-pricing/ (matches `pricing/docs__workers__platform__pricing.mdx`).
- "The Workers Free plan only supports Durable Objects with SQLite storage backend." Source: https://developers.cloudflare.com/durable-objects/platform/pricing/ (matches the partial in `pricing/`).
- SQLite storage billing for Durable Objects enabled January 2026 (target 2026-01-07); Workers Free plan users are not charged for it. Source: https://developers.cloudflare.com/changelog/2026-01-07-durable-objects-sqlite-storage-billing
- A search summary claimed "approximately 3 million requests per month" for free Durable Objects; the docs source says 100,000 / day. Use the docs source.
- Workers AI: $0.011 per 1,000 Neurons, 10,000 Neurons per day free. Source: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Agent tracing is free in beta; from 2026-10-01 it is billed as part of Workers Observability pricing. Source: search summary citing developers.cloudflare.com (exact page not shown).
- No standalone "Agents SDK" price: cost is the underlying Workers + Durable Objects (+ Workers AI, Workflows, etc.). Source: https://developers.cloudflare.com/workers/platform/pricing/ and the Agents limits page.
