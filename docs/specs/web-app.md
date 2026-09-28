# Web app spec (Raha's side)

Two-sided platform: brands and creators, meeting in one negotiation and one deal.
Product brief: `../../BRIEF.md`. Contract with Andrii's server: the JSON shapes in BRIEF.md.

## Stack

- Next.js (App Router) + Tailwind in `web/`, dev server on **port 3500** (3000 is taken)
- Apify called only from server routes, so `APIFY_TOKEN` never reaches the browser
- Andrii's backend is Cloudflare Agents. The frontend subscribes to a negotiation with
  `useAgent({ agent: "Negotiation", name: dealId })` from `agents/react`
  (`reference/cloudflare-agents.md`). Until that exists, the same screens read fake JSON.

## Screens

Ordered by the 3-minute demo.

| Route | Side | What it shows |
|---|---|---|
| `/` | both | Pick a side: "I'm a brand" / "I'm a creator" |
| `/brand/setup` | brand | Budget, headcount, niche, platforms, min engagement, price flex %, deliverables |
| `/brand/creators` | brand | Ranked creator list with real numbers: followers, avg views (30d), engagement, fair price |
| `/creator/setup` | creator | Handle + platform, floor rate, refused categories, max deals per month |
| `/creator` | creator | "What you're worth": last 30 days, fair price, incoming offers |
| `/deals/[id]` | both | Live negotiation transcript (offer, counter, agreement) + deal timeline |
| `/brand` | brand | Budget bar ($ spent / held / left) and every deal's status |

`/deals/[id]` is one page shared by both sides. Deal timeline states come straight from the
contract: `negotiating > agreed > paid > held > live > paid_out` (or `refunded`).

## Data

| Thing | Source | Real or fake |
|---|---|---|
| `Creator` | Apify: TikTok (`clockworks/tiktok-scraper`), Instagram Reels (`apify/instagram-reel-scraper`) | **Real**, cached to `web/data/creators/*.json` |
| Fair price | `web/lib/pricing.ts` | **Real** formula on real numbers |
| `Offer`, `Deal` | Andrii's server | Fake JSON until ~1:30 PM, then real |
| Outreach email | drafted text on screen | Never sent (per brief) |
| Post-is-live check | Andrii (Browserbase) on one known URL | Simplified (per brief) |

X is skipped (Apify free plan blocks API use). LinkedIn is skipped (no public view counts).

## Pricing formula

```
fairPrice = avgViews30d / 1000 x CPM(niche) x engagementMultiplier
engagement = avg of (likes + comments) / views, per post, last 30 days
engagementMultiplier = clamp(1 + (engagement - 0.04) x 5, 0.8, 1.3)
```

6% engagement gives 1.1x, matching the brief's example (80k views, $20 CPM, 1.1x = $1,760).

CPM by niche (placeholder guesses, tune later): fitness 20, beauty 25, tech 30, finance 35,
food 15, gaming 12, other 18.

## Out of scope today

Auth, real email sending, all 4 platforms, mobile polish, deploy (demo runs on localhost).
