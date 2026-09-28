# Reference pack

Source-backed notes for building Creator Deals, so nobody has to guess an
API. Collected 2026-09-28. Product brief: `../BRIEF.md`.

How to use it:

- Each `<vendor>.md` is the implementer guide: setup, code, pricing,
  gotchas, and an **Unverified** list at the end.
- `raw/<vendor>/` holds the verbatim source files every claim points to.
- The vendor sites themselves (stripe.com, browserbase.com, apify.com,
  brainbaselabs.com, cloudflare.com) were blocked from the machine that
  built this, so docs were pulled from the vendors' own GitHub repos and
  **every price comes from search results. Re-check prices before quoting
  them.**
- If a guide and the live docs disagree, the live docs win. Fix the guide.

## Files

| Guide | Used for |
|---|---|
| [stripe.md](stripe.md) | Brand pays, funds held, creator paid out, refunds, platform fee |
| [apify.md](apify.md) | Creator discovery and last-30-days views on IG, TikTok, X, LinkedIn |
| [browserbase.md](browserbase.md) | Real browser for pages Apify cannot do, post-is-live check, brand sites |
| [brainbase.md](brainbase.md) | Hosting the brand agent and creator agent (hackathon host platform) |
| [cloudflare-agents.md](cloudflare-agents.md) | Our backend: `deals` MCP server, one Durable Object per negotiation |

## Architecture these docs point to

```
Brand agent (Brainbase)          Creator agent (Brainbase)
        \                              /
         \---- our "deals" MCP -------/     Cloudflare Worker,
                    |                        1 Durable Object per negotiation
     rules: budget cap, creator floor,       (holds offers, deadline timer)
     pricing formula, deal state
          |            |             |
        Apify      Browserbase     Stripe
     (profiles,   (post is live,  (charge brand, hold on platform,
      views)       brand sites)    transfer to creator, or refund)
```

Agents only negotiate. Anything with money or hard limits (budget cap,
floor, charge, transfer, refund) lives in our own MCP tools, so an agent
can never overspend or pay out early.

## Key decisions the docs support

- **Stripe:** Connect creator accounts (Express dashboard) +
  **separate charges and transfers**. Brand is charged to the platform,
  the transfer to the creator happens only after the post is verified,
  our fee is the difference. Do not use destination charges (they pay out
  immediately) or card holds (expire after 7 days). See stripe.md.
- **Data:** Apify for bulk profile and post data. View counts: TikTok and
  X yes, Instagram reels only, LinkedIn none (price on engagement there).
- **Browser:** Browserbase / Stagehand v4. The old `bb` CLI is deprecated;
  use `browse`. Scrape logged out (legal risk when logged in).
- **Agents:** Brainbase managed agents via the CLI and
  `brainbase.agent.yaml` with an `mcp:` block. Run one tiny task in the
  first 15 minutes to confirm credits actually work.

## Demo cost ballpark (re-check)

| Item | Estimate |
|---|---|
| Stripe | Test mode, $0 |
| Apify | ~$10-14 for 50 profiles x 30 posts on 4 platforms; free tier ~$5/mo; X actor needs a paid plan |
| Browserbase | Free: 1 browser hour. Developer $20/mo: 100 h |
| Cloudflare | Free plan covers the demo |
| Brainbase | Hackathon credits (reported, unconfirmed) |

## Day-one checks (from the Unverified lists)

1. Brainbase account has credits (run one task).
2. Stripe: exact onboarding call for Accounts v2, and that the MCP server
   exposes transfer tools (else call the API from our MCP).
3. Apify: log one raw item per actor and fix field names (X, LinkedIn).
4. Browserbase: can a logged-out browser see IG / TikTok view counts, and
   what does a deleted post URL return.
