# Speedrun Agent

Two AI agents negotiate a creator sponsorship, one for the brand and one for the creator. Stripe pays only when the post is live.

Built in a day at the Startup Speedrun Hackathon at Cloudflare HQ, September 2026, Agentic Payments track.

## How it works

1. The brand sets a budget, a niche and how far a deal can flex.
2. The brand agent finds creators by scraping public profiles, and prices each one from real view data.
3. The brand agent and the creator agent negotiate.
4. Stripe charges the brand and holds the money.
5. Once the post is live, the money goes to the creator. If it never goes up, the brand is refunded.

## Stack

Brainbase agents, a Cloudflare MCP server with one Durable Object per deal, Stripe Connect, Apify, Browserbase, and a Next.js frontend in `web/`.

## Run

```bash
cd web
npm install
npm run dev   # http://localhost:3500
```

The full product brief is in [BRIEF.md](BRIEF.md).

## Team

Andrii (backend and agents), Raha Zholdoshkanov (frontend and data).
