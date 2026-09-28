# Step 2: the deal page

Route: `/deals/[id]`, reached from "Negotiate" on `/brand/creators`. For the demo, `id` is the
creator handle without `@` (for example `/deals/nicktarmo`). This is the page the judges watch,
so it has to feel live even before Andrii's server exists.

## What the page shows

```
+--------------------------------------------------+----------------------+
| Header: creator avatar + name, status badge      |                      |
+--------------------------------------------------+  Price card          |
| Live negotiation                                 |  fair / floor /      |
|                                                  |  ceiling / current   |
|  [Brand agent]  Offer $700  (-16% vs fair)       |                      |
|                 "Your last 30 days average..."   |  Timeline            |
|                     [Creator agent]  Counter $960|  o negotiating       |
|                     "My engagement is 3.4%..."   |  o agreed            |
|  ... typing                                      |  o paid              |
|  ---- Deal agreed at $840 ----                   |  o held              |
|  ---- Brand paid $840, Stripe is holding it ---- |  o live              |
|                                                  |  o paid out          |
|                                                  |                      |
|                                                  |  Terms + actions     |
+--------------------------------------------------+----------------------+
```

1. **Header**: creator avatar and name, platform, a status badge that follows the deal.
2. **Negotiation chat**: brand agent messages on the left, creator agent on the right. Each
   message is an offer card with the amount, how far it is from the fair price, and a short
   reason that quotes the real numbers (avg views, engagement). Center rows for system events
   (agreed, paid, held, post live, paid out). A typing indicator between messages.
3. **Price card**: fair price, creator floor, brand ceiling, latest offer. A small range bar
   shows where the current offer sits between floor and ceiling.
4. **Timeline**: `negotiating > agreed > paid > held > live > paid_out` from the contract.
   Done steps get a check, the current step is black, future steps are gray.
5. **Terms**: deliverables (1 reel + 1 story), deadline (7 days), platform fee (10%), creator
   payout.
6. **Actions**, each enabled only in the right state:
   - "Pay with Stripe" when `agreed` (fake: moves to `paid`, then `held`)
   - "Mark post live" when `held` (stands in for Andrii's Browserbase check)
   - "Release payout" when `live` (fake: moves to `paid_out`)
   - "Replay" to restart the negotiation for the demo

## Rules the fake negotiation follows

Same rules Andrii's server will enforce, so the switch changes nothing visible.

- Fair price from `lib/pricing.ts` on real scraped numbers
- Brand ceiling = fair x 1.3 (the brief's +/- 30% flex); brand opens at fair x 0.8
- Creator floor = fair x 0.9; creator opens at fair x 1.2
- Each round both sides move toward each other; they agree once the gap is under 5%
- The agreed price never goes above the ceiling or below the floor
- Budget left = $20,000 minus the agreed price

## Data layer

`src/lib/deals/`:

- `negotiate.ts`: pure function, `(creator) => Offer[]`, the scripted rounds above
- `use-deal.ts`: client hook, `useDeal(creator)` returns `{ offers, deal, typing, pay, markLive,
  releasePayout, replay }`. Plays offers one by one on a timer.
- Later: `useDeal` swaps its internals for Andrii's `useAgent({ agent: "Negotiation",
  name: dealId })`. The page does not change.

Types come from `shared/contract.ts` (`Offer`, `Deal`, `DealStatus`). No contract changes.

## Components (Untitled UI only)

Avatar, AvatarLabelGroup, Badge, BadgeWithDot, Button, ProgressBar, icons from
`@untitledui/icons`. Black and white; status colors only where they carry meaning
(success on paid out).

## Done when

- `/deals/nicktarmo` plays a full negotiation with real numbers, ends in "agreed"
- Pay, mark live, and release payout walk the timeline to "paid out"
- Replay restarts it
- Every "Negotiate" button on `/brand/creators` opens a working deal page
- Looks right at desktop and 400px wide
