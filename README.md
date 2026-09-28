# speedrun-agent

Startup Speedrun Hackathon, Cloudflare HQ, 2026-09-28.
Agentic Payments track (Stripe).

## Start here

Read [BRIEF.md](BRIEF.md). The split is in the "Who does what" section.

**Andrii: backend and agents**

- Brand agent and creator agent on Brainbase ([reference/brainbase.md](reference/brainbase.md))
- `deals` MCP server on Cloudflare, one Durable Object per negotiation ([reference/cloudflare-agents.md](reference/cloudflare-agents.md))
- Stripe: charge brand, hold, transfer to creator, refund ([reference/stripe.md](reference/stripe.md))
- Post-is-live check with Browserbase ([reference/browserbase.md](reference/browserbase.md))
- First 15 minutes: run one trivial Brainbase task to confirm credits

**Raha: frontend and data**

- Apify scraping and the pricing formula ([reference/apify.md](reference/apify.md))
- All screens, and drives the demo

Agree on the JSON contract in BRIEF.md (`Creator`, `Offer`, `Deal`) before coding.
End to end on fake data by 1:30 PM. Hacking ends 3:30 PM.
