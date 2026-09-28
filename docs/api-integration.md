# Wiring the web app to the deals server

Live backend (Railway, always on): `https://api-production-4aa5.up.railway.app`
Local: `cd server && npm run dev` → `http://localhost:8787`. CORS is open.
Full route list and curl sequence: `server/README.md`.

## What changed vs `shared/contract.ts`

`Offer.amount` became `Offer.package` (cash + product/services + affiliate % + store credit + custom perks),
because deals are not cash-only (a salon pays with a color session + $500). For the UI:

- cash to show = `offer.package.cash_usd`
- "non-cash" line = `offer.package.product.map(p => `${p.qty}x ${p.sku}`)`, `offer.package.affiliate_pct`, `offer.package.custom`
- `value_for_brand_usd` / `value_for_creator_usd` on each turn = how each side values the whole package (nice for the price chart: two lines, they cross when the deal closes)
- `Deal.price` = the cash part the brand pays through Stripe

Deal statuses the server emits: `negotiating → agreed → held → paid_out`, or `refunded`, or `walked_away`
(no separate `paid`/`live`; `held` means paid and held, `paid_out` means verified live and paid out).

## Replacing the fake engine in `web/src/lib/deals/use-deal.ts`

1. `POST /campaigns` `{ brandSlug: "marine-layer" | "temescal-hair" }` once → `campaignId` (keep it in localStorage).
2. `POST /deals` `{ campaignId, creatorSlug: "maya-wears" }`, or for a scraped creator
   `{ campaignId, creatorSlug: handleWithoutAt, creator: <Creator from shared/contract> }` → `{ dealId, status: "negotiating" }`.
3. Poll `GET /deals/:id` every 3 s. `turns[]` grows one at a time (~10 s per turn, 4-7 turns). Each turn is
   `{ round, from, package, deliverables, usage_rights, exclusivity, deadline, message, status, ts, value_for_brand_usd, value_for_creator_usd }`.
   Show `message` in the chat, `package.cash_usd` as the offer amount. Stop polling when `status !== "negotiating"`.
4. Pay button → `POST /deals/:id/fund` → status `held` (real Stripe test-mode PaymentIntent, ~2 s).
5. Mark live → `POST /deals/:id/verify` `{ url, mock: true }` (or a real page URL with `mock: false`, e.g. the brand site) → status `paid_out`, `stripe.transferId` set, `budgetLeft` drops.
6. Refund path → `POST /deals/:id/expire` → `refunded`.
7. `GET /campaigns/:id` → `{ budgetTotal, budgetLeft, deals[] }` for the budget bar.

Transcript for either party's page: `GET /deals/:id/transcript` (same payload for brand and creator, nothing private in it).

Demo reset: `POST /admin/reset` `{ campaignId }`, or just create a new campaign.

## Market: evaluation + match

Every `agreed` deal is scored from both sides (`server/src/market/`). Each view only shows its own side.

- `GET /campaigns/:id/evaluation` (brand view) → `{ campaignId, brandSlug, budgetLeft, ranked: [{ rank, dealId, creatorSlug, cash_usd, value_usd, surplus_usd, implied_cpm_usd, package }] }`, best first. No creator floors.
- `GET /creators/:slug/evaluation` (creator view, across all campaigns) → `{ creatorSlug, ranked: [{ rank, dealId, brandSlug, campaignId, cash_usd, value_usd, surplus_usd, package }] }`. No brand caps.
- `POST /market/match` `{ campaignIds: string[], headcount?: number }` (headcount = max creators per brand, default 3) → `{ selected, not_selected, explain: { [dealId]: reason }, brandRankings: { [campaignId]: [...] }, creatorRankings: { [creatorSlug]: [...] } }`. Writes `deal.selection` (`selected` / `not_selected`) and `deal.ranks` (`{ brand, creator }`, 1 = best) on every deal; `GET /deals/:id` returns them. `POST /deals/:id/fund` answers 409 for a `not_selected` deal.

MCP tools: `evaluate_campaign`, `evaluate_creator`, `match_market`.
