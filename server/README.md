# creator-deals server

Cloudflare Worker (Hono) with three Durable Objects:

- `CampaignDO` (binding `CAMPAIGN`): the brand budget and a ledger of what each deal holds.
  `budgetLeft = budgetTotal - sum(reserved + committed)`.
- `DealDO` (binding `DEAL`): one per deal. Runs the negotiation on create, stores the transcript in
  SQLite, and owns every status transition that touches Stripe.
- `MarketDO` (binding `MARKET`, singleton `market`): index of every deal by campaign and creator, so
  the market layer (`/campaigns/:id/evaluation`, `/creators/:slug/evaluation`, `/market/match`) can
  score deals across campaigns. Demo: `cd server && npx tsx ../scripts/market-demo.ts`.

Deal statuses: `agreed` (price reserved in the campaign) or `walked_away` after negotiation,
then `held` (brand charged) -> `paid_out` (post verified, creator transferred) or `refunded` (expired).

## Run

```sh
cd server
npm install
npx wrangler dev --port 8787
```

`server/.dev.vars` (gitignored) holds every secret:

```
STRIPE_SECRET_KEY=sk_test_...     # fund / verify / expire. Test-mode keys only (sk_test_ / rk_test_)
STRIPE_WEBHOOK_SECRET=whsec_...   # optional: POST /stripe/webhook (from `stripe listen`)
OPENAI_API_KEY=sk-...             # LLM negotiation; without it the deterministic engine runs
OPENAI_MODEL=gpt-5-mini           # optional
LLM_MODE=off                      # optional: force the engine even with a key
VERIFY_MODE=mock                  # optional: allows mock verify (Instagram/TikTok need a real browser). Off = mock requests get 403
HOLD_DEADLINE_SECONDS=120         # optional: auto-refund a held deal after this long (default 7 days)
```

Template: `server/.dev.vars.example`.

`campaigns`, `deals`, `transcript` work with no keys. With `OPENAI_API_KEY`, `POST /deals` returns
`status: "negotiating"` immediately and the transcript fills in turn by turn (poll `GET /deals/:id`
every ~3 s, ~10 s per turn, 4-7 turns). Without it the deal comes back `agreed`/`walked_away` at once.

Brands bundled: `marine-layer` (apparel, goods barter), `temescal-hair` (salon, services barter).
Creators bundled: `maya-wears`. Any other `creatorSlug` needs a `creator` object (scraper output) in the body.

Demo reset: `cd server && npx tsx ../scripts/seed.ts --run` creates a campaign, one deal, and polls it to the end.

## Routes

| Method | Path                     | Body                                     | Notes |
| ------ | ------------------------ | ---------------------------------------- | ----- |
| POST   | `/campaigns`             | `{ brandSlug, budgetUsd? }`              | 404 if brand unknown; default budget = brand's `budget_total_usd` |
| GET    | `/campaigns/:id`         |                                          | adds `deals: [{ dealId, creatorSlug, status, price }]` |
| POST   | `/deals`                 | `{ campaignId, creatorSlug, creator? }`  | negotiates now; `agreed` reserves the price, or `walked_away` (`walkReason: budget` if the campaign cannot cover it) |
| GET    | `/deals/:id`             |                                          | Deal + `turns` |
| GET    | `/deals/:id/transcript`  |                                          | `{ dealId, turns }`, safe for both sides |
| POST   | `/deals/:id/fund`        |                                          | `agreed` -> `held`. Connect account + PaymentIntent. 422 if cash < $0.50 (product-only deal); 409 if the creator account cannot receive transfers (brand is not charged). Sets `holdUntil` |
| POST   | `/deals/:id/verify`      | `{ url, mock? }`                         | `held` -> `paid_out` on success (200); 422 and stays `held` otherwise. `mock: true` needs `VERIFY_MODE=mock` (else 403) |
| POST   | `/deals/:id/expire`      |                                          | `held` -> `refunded`, budget returns. Also runs automatically at `holdUntil` (Durable Object alarm) |
| GET    | `/campaigns/:id/evaluation` |                                       | brand view: agreed deals ranked best first (`rank, dealId, creatorSlug, cash_usd, value_usd, surplus_usd, implied_cpm_usd, package`); no creator-side numbers |
| GET    | `/creators/:slug/evaluation` |                                      | creator view across campaigns: agreed deals ranked best first (`rank, dealId, brandSlug, campaignId, cash_usd, value_usd, surplus_usd, package`); no brand caps |
| POST   | `/market/match`          | `{ campaignIds, headcount? }`            | ranks both sides, runs the match (budget, headcount per brand, creator slots), writes `selection` + `ranks` on each deal. Returns `{ selected, not_selected, explain, brandRankings, creatorRankings }`. `fund` then answers 409 for `not_selected` deals |
| POST   | `/stripe/webhook`        | Stripe event (signed)                    | Verifies `stripe-signature`, logs payment / refund / transfer events per deal |
| POST   | `/admin/reset`           | `{ campaignId }`                         | clears the campaign ledger for demo re-runs |

Errors are `{ "error": "..." }` with a 4xx/5xx status.

## The curl sequence

```sh
BASE=http://localhost:8787

# 1. campaign for Marine Layer (budget 50,000 from the profile)
curl -s -X POST $BASE/campaigns -H 'content-type: application/json' \
  -d '{"brandSlug":"marine-layer"}'
# -> { "campaignId": "...", "brandSlug": "marine-layer", "budgetTotal": 50000, "budgetLeft": 50000 }
CID=<campaignId>

# 2. negotiate with Maya. Expect status "agreed", price = accepted cash, budgetLeft = 50000 - price
curl -s -X POST $BASE/deals -H 'content-type: application/json' \
  -d "{\"campaignId\":\"$CID\",\"creatorSlug\":\"maya-wears\"}"
DID=<dealId>

# 3. full deal with turns
curl -s $BASE/deals/$DID

# 4. transcript only (no private numbers)
curl -s $BASE/deals/$DID/transcript

# 5. campaign now lists the deal and the reduced budget
curl -s $BASE/campaigns/$CID

# --- Stripe from here (needs STRIPE_SECRET_KEY) ---

# 6. brand pays. Expect status "held" and stripe.accountId / paymentIntentId
curl -s -X POST $BASE/deals/$DID/fund

# 7a. real verify: fetches the page and looks for the brand handle (@marinelayer).
#     Marine Layer's homepage passes -> status "paid_out", stripe.transferId set, 200
curl -s -X POST $BASE/deals/$DID/verify -H 'content-type: application/json' \
  -d '{"url":"https://www.marinelayer.com/","mock":false}'

# 7b. mock verify (no network), same transition. Use on a second held deal, or when offline
curl -s -X POST $BASE/deals/$DID/verify -H 'content-type: application/json' \
  -d '{"url":"https://www.instagram.com/p/whatever/","mock":true}'

# A failed verify (e.g. an Instagram URL without mock) returns 422 with the verify result and
# the deal stays "held". Retry later or expire it.

# 8. expire on a second deal: create + fund another one, then refund it
curl -s -X POST $BASE/deals -H 'content-type: application/json' \
  -d "{\"campaignId\":\"$CID\",\"creatorSlug\":\"maya-wears\"}"
DID2=<dealId>
curl -s -X POST $BASE/deals/$DID2/fund             # -> held
curl -s -X POST $BASE/deals/$DID2/expire           # -> refunded, stripe.refundId set, budget returns

# 9. wipe the ledger for a re-run
curl -s -X POST $BASE/admin/reset -H 'content-type: application/json' -d "{\"campaignId\":\"$CID\"}"
```

## Swapping the negotiation

`negotiate(brand, creator, now)` at the top of `src/deal.do.ts` is the only call into the engine.
Replace its body with the LLM version; it must return the same `NegotiationResult`.

## Stripe notes

- Pattern: separate charges and transfers. The brand's PaymentIntent lands on the platform, the
  payout is `transfers.create` with `source_transaction` (no fallback without it).
- Test card: `pm_card_bypassPending` (4000 0000 0000 0077), so funds show as available right away.
- Creator accounts are Accounts v2 recipients (`dashboard: 'none'`, test-mode prefill). Accounts that
  cannot receive transfers are skipped, never reused. One account per creator per day (idempotency key).
- API version pinned to `2026-08-26.dahlia`, 10 s timeout.
- Webhooks locally: `stripe listen --forward-to localhost:8787/stripe/webhook`, put the printed
  `whsec_...` in `.dev.vars`.

## Scraped creators

`POST /deals` accepts an optional `creator` (the scraper's `Creator` shape: `handle, platform,
followers, avgViews30d, engagement, fairPrice`). It is used only when `creatorSlug` has no bundled
profile; a minimal `CreatorProfile` is derived around `fairPrice` (floor at 75%).

Every deal caps the brand at 1.3x the creator's own bundle rate (`src/pricing.ts`, `brandForCreator`),
so offers follow real reach: a 600-view account no longer gets the same cash as a 60k-view one.
