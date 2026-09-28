# Creator Deals - product brief

Working name. Built for the Startup Speedrun Hackathon (Sept 28, 2026),
Agentic Payments track, with room to touch Autonomous Organizations.

## One line

Two AI agents negotiate a brand sponsorship, one for the brand and one for
the creator, both grounded in real view data, and Stripe moves the money
only when the post is live.

## The problem

Creator sponsorships are still run by hand on both sides.

- **Brands** have someone searching Instagram, TikTok, X and LinkedIn for
  creators, writing cold emails, haggling one by one, and tracking a budget
  in a spreadsheet.
- **Creators** (say 300k followers, many deals a month) answer every email
  themselves. They get lowballed because they do not know what their
  recent reach is actually worth, or whether last month's deal was fair.
- **Payment** is invoices, net-30, chasing, and no guarantee either way:
  brands fear paying for a post that never goes up, creators fear posting
  and never getting paid.

## The product

### 1. Brand agent

The brand sets rules once:

- Total budget and headcount, e.g. $20,000 for 10 creators
- Niche, platforms, audience region, minimum engagement rate
- How far a single deal may flex (e.g. +/- 30% of target price)
- Deliverables (1 reel, 1 story, link in bio)

The agent then:

1. **Discovers** creators by scraping public profiles (Apify actors for
   Instagram, TikTok, X, LinkedIn).
2. **Scores** them: recent average views, engagement, niche fit.
3. **Prices** each one with the shared pricing model (below).
4. **Reaches out** with a drafted email / DM with a concrete offer.
5. **Negotiates** within its rules, and rebalances the budget across the
   roster: if creator A costs more, it spends less elsewhere or drops a
   lower-value creator, and never exceeds the $20k cap.

### 2. Creator agent

The creator sets rules once:

- Floor rate, or "never below X per 1k views"
- Categories they refuse (gambling, crypto, etc.)
- Max deals per month, exclusivity rules

The agent then:

1. **Pulls the last 30 days** of their own posts via Apify (views, likes,
   comments) to know what their reach is worth right now.
2. **Compares** each incoming offer with that number and with what they
   were paid on past deals.
3. **Accepts, counters or declines** automatically, escalating to the
   human only near the edges of the rules.

### 3. The deal and the money (the Stripe part)

When the two agents agree:

1. A deal record is created: price, deliverables, deadline.
2. **Brand pays upfront** into the platform (Stripe Checkout / Payment
   Intent). The money is held, not sent yet.
3. Creator is onboarded once as a **Stripe Connect** account.
4. Creator posts. The agent **verifies the post is live** (Apify checks the
   URL, caption, tag or link).
5. Platform **transfers the payout** to the creator's Connect account and
   keeps a fee. That fee is the business model.
6. If the post never goes up by the deadline, the brand is **refunded**.

This is what makes it "agentic payments": agents manage a budget, commit
money, and release it on a verified condition, with no human in the loop.

## The pricing model (why nobody gets lowballed)

Both agents use the same transparent formula, so negotiation starts from
data instead of vibes:

```
fair price = avg views per post (last 30 days)
           x CPM (price per 1,000 views for the niche)
           x engagement multiplier
```

Example: 300k followers, 80k average views, $20 CPM, 1.1x engagement
-> about $1,760 per reel. The brand agent's rules and the creator agent's
floor decide where inside the range they settle.

## Why this fits the track

- Agents **transact**: they commit real money (Stripe test mode).
- Agents **manage budgets**: $20k across 10 creators, rebalanced live.
- Money moves on a **verified condition** (post is live), not on trust.
- Two sides means two cooperating / competing agents, which also touches
  the Autonomous Organizations track.

## 8-hour scope

**Real in the demo**

- Brand setup form (budget, niche, rules)
- Creator setup form (floor, refusals)
- Apify scrape of real public profiles and last 30 days of views
- Pricing model
- Agent to agent negotiation (Claude, visible transcript)
- Stripe test mode: brand pays, funds held, transfer to Connect account
  after "post verified"

**Faked or simplified**

- Outreach email: drafted and shown, not actually sent
- Discovery: a shortlist from 1 or 2 platforms instead of all 4
- Post verification: check one known URL

**Demo script (3 minutes)**

1. Brand: "$20k, 10 fitness creators, US audience." Agent finds and ranks
   creators with real numbers.
2. Creator side: agent pulls their last 30 days, sets their fair price.
3. Live negotiation transcript: offer, counter, agreement.
4. Brand pays in Stripe, money is held.
5. "Post goes live", verification passes, creator gets paid, budget
   dashboard updates.

## Suggested stack

- Claude for both agents (tool use: scrape, price, offer, pay)
- Apify for Instagram / TikTok / X / LinkedIn data
- Stripe: Checkout or Payment Intents, Connect, Transfers, Refunds
- Cloudflare Workers / Agents SDK to host the agents, one durable
  object per negotiation (also a nod to the infra track)

## Who does what

Rule of thumb: Raha owns everything people **see** and every **number**,
Andrii owns everything that **thinks** and **moves money**.

**Raha - frontend and data**

- Apify scraping: creator profiles, last 30 days of posts, avg views,
  engagement (`reference/apify.md`)
- The pricing formula (fair price per creator)
- Screens: brand setup, creator list with numbers, live negotiation chat,
  deal status (budget bar, paid / held / live / paid out timeline)
- Drives the demo

**Andrii - backend and agents**

- Brand agent and creator agent on Brainbase (`reference/brainbase.md`)
- `deals` MCP server on Cloudflare, one Durable Object per negotiation,
  enforces budget cap and creator floor (`reference/cloudflare-agents.md`)
- Stripe: charge brand, hold, transfer to creator after verification,
  refund (`reference/stripe.md`)
- Post-is-live check with Browserbase (`reference/browserbase.md`)
- First 15 minutes: run one trivial Brainbase task to confirm credits. If
  it fails, fall back to calling Claude directly with the same tools.

**The contract between us** (agree before coding, build against fake JSON
until the other side is ready):

```json
Creator: { "handle": "@fitjane", "platform": "tiktok", "followers": 300000,
           "avgViews30d": 80000, "engagement": 0.06, "fairPrice": 1760 }
Offer:   { "dealId": "d1", "from": "brand", "amount": 1500, "message": "..." }
Deal:    { "dealId": "d1",
           "status": "negotiating | agreed | paid | held | live | paid_out | refunded",
           "price": 1700, "budgetLeft": 18300 }
```

Raha produces `Creator`. Andrii's server consumes it and produces `Offer`
and `Deal`, which Raha's screens display.

**Timing:** hacking ends 3:30 PM. End to end on fake data by 1:30 PM,
real data after that.

## Open questions

- Does the creator side exist at launch, or is it brand only and creators
  just get an email with a fair offer?
- Fee model: % of each deal from the brand, the creator, or both?
- Platform terms: scraping public data is fine for a demo, but a real
  product needs official APIs or creator-connected accounts.
- Contracts / FTC disclosure (#ad) handling.
