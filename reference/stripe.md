# Stripe reference for Creator Deals

Digest for the implementer. Every claim points to a file under `raw/stripe/`
(verbatim copies from Stripe's official `stripe/ai` repo, commit
`f23b5bad7a5b20d403bb11cf425044b85ee7c716`, dated 2026-09-28) or to a URL.
URLs marked "(search)" were found via the WebSearch tool on 2026-09-28
because stripe.com and docs.stripe.com were blocked from this sandbox. Those
were read as search snippets only, not as full pages, so re-check them
before relying on them.

Anything not backed by a source is in "Open questions / unverified" at the
bottom. Do not treat it as fact.

---

## 1. What we use and why

| Stripe piece | Used for in Creator Deals | Source |
|---|---|---|
| Checkout Sessions (or PaymentIntents) | Brand pays the agreed deal price upfront to the platform | `raw/stripe/skills/stripe-best-practices/references/payments.md` ("API hierarchy") |
| Connect, Accounts v2 (`/v2/core/accounts`) | Each creator is a connected account that can receive transfers | `raw/stripe/skills/stripe-best-practices/references/connect.md` (rule 1) |
| Separate charges and transfers | Hold money on the platform until the post is verified, then transfer | `raw/stripe/skills/connect-recommend/references/charge-patterns.md` ("Separate Charges and Transfers", "Decision Guide") |
| Transfers API (`transfers.create`) | Payout to the creator after verification, minus our fee | same file, "Code pattern" |
| Refunds API (`refunds.create`) | Refund the brand if the post never goes live | same file, "Refunds" |
| Webhooks | Source of truth for "brand has paid" and for account capability changes | `raw/stripe/skills/stripe-best-practices/references/connect.md` ("Webhooks"), `payments.md` ("Webhooks and fulfillment") |
| Embedded components / account links | Creator onboarding (KYC) | `raw/stripe/skills/stripe-best-practices/references/connect.md` ("Onboarding", "Embedded components") |
| Stripe MCP server / Agent Toolkit | Optional: let the Claude agents call Stripe as tools (e.g. read balance, refund) | `raw/stripe/tools/README.md`, `raw/stripe/tools/typescript/MIGRATION.md` |

Why separate charges and transfers: Stripe's own Connect skill says
destination charges transfer funds automatically on payment success and are
"NOT for hold-and-release or delivery-gated payouts"; hold-and-release, where
funds are released only after a trigger such as delivery or approval, should
use separate charges and transfers
(`raw/stripe/skills/connect-recommend/references/charge-patterns.md`, "When to use" under
Destination Charges; `raw/stripe/skills/connect-recommend/references/decision-matrix.md`, line
"If the platform needs to hold funds and only transfer to the connected account after a trigger";
`raw/stripe/skills/stripe-best-practices/references/connect.md`, "Traps to avoid").
"Post is live and verified" is exactly that kind of trigger.

---

## 2. Exact setup

### 2.1 Install

Server SDK (Node). The best-practices skill lists the latest Node SDK as
22.6.0 and the latest API version as `2026-08-26.dahlia`
(`raw/stripe/skills/stripe-best-practices/SKILL.md`).

```bash
npm install stripe
```

Agent Toolkit (optional, for giving agents Stripe tools). Node 18+
(`raw/stripe/tools/README.md`, "TypeScript"; package version 0.9.1 in
`raw/stripe/tools/typescript/package.json`):

```bash
npm install @stripe/agent-toolkit
```

Python toolkit, Python 3.11+ (`raw/stripe/tools/README.md`, "Python"):

```bash
pip install stripe-agent-toolkit
```

Test account without registering (`raw/stripe/skills/stripe-best-practices/SKILL.md`):

```bash
npm i -g @stripe/cli
stripe sandbox create
```

The same file says: if `stripe sandbox create` is used, do not use MCP until
`stripe sandbox claim` has been run.

Claude Code plugin with Stripe skills (`raw/stripe/README.md`, "Claude Code"):

```bash
claude plugin install stripe@claude-plugins-official
```

### 2.2 Environment variables

| Var | Meaning | Source |
|---|---|---|
| `STRIPE_SECRET_KEY` | Server key. Read by the local MCP server if `--api-key` is not passed; used as `process.env.STRIPE_SECRET_KEY` in toolkit examples | `raw/stripe/tools/modelcontextprotocol/src/cli.ts` (`parseArgs`), `raw/stripe/tools/typescript/examples/ai-sdk/index.ts` |
| Webhook signing secret | Needed to verify webhook signatures. The name is our choice (e.g. `STRIPE_WEBHOOK_SECRET`) | `raw/stripe/skills/stripe-best-practices/references/security.md` ("Webhook security") |
| Publishable key | Frontend Stripe.js key (`pk_test_...`), only if we embed Payment Element instead of hosted Checkout | `raw/stripe/skills/connect-recommend/references/charge-patterns.md` (frontend snippet) |

Key rules from the source:

- Use a restricted API key (`rk_...`) rather than a secret key (`sk_...`).
  Tool availability in the MCP server and Agent Toolkit is controlled by the
  RAK's permissions (`raw/stripe/tools/README.md`,
  `raw/stripe/skills/stripe-best-practices/references/security.md`, "Restricted API keys").
- The local MCP CLI accepts only `sk_` or `rk_` prefixes and warns on `sk_`
  (`raw/stripe/tools/modelcontextprotocol/src/cli.ts`, `validateApiKey`).
- Never put keys in source code or committed env files
  (`raw/stripe/skills/stripe-best-practices/references/security.md`, "API keys").
- Instantiate a `StripeClient`; do not use the deprecated global key pattern
  (`raw/stripe/skills/stripe-best-practices/SKILL.md`, "Critical rules").

### 2.3 MCP server config for Claude

Remote server (OAuth). Stripe hosts it at `https://mcp.stripe.com`
(`raw/stripe/README.md`, `raw/stripe/tools/README.md`). The Claude plugin's
config is, verbatim (`raw/stripe/providers/claude/plugin/.mcp.json`):

```json
{
  "mcpServers": {
    "stripe": {
      "type": "http",
      "url": "https://mcp.stripe.com"
    }
  }
}
```

Local server via npx (`raw/stripe/tools/modelcontextprotocol/README.md`):

```bash
npx -y @stripe/mcp --api-key=YOUR_STRIPE_SECRET_KEY

# To configure a Stripe connected account
npx -y @stripe/mcp --api-key=YOUR_STRIPE_SECRET_KEY --stripe-account=CONNECTED_ACCOUNT_ID
```

Claude Desktop config, verbatim from the same README:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp", "--api-key=STRIPE_SECRET_KEY"]
    }
  }
}
```

The local CLI only accepts `--api-key` and `--stripe-account`; the old
`--tools` flag was removed (`raw/stripe/tools/modelcontextprotocol/src/cli.ts`).

MCP tool list: not in the repo. The READMEs point to
https://docs.stripe.com/mcp#tools, which was blocked. Third-party catalogs
(search) list tools such as `create_payment_link`, `create_refund`,
`retrieve_balance`, `list_payment_intents`, `create_customer`,
`search_stripe_documentation`, `get_stripe_account_info`
(https://www.speakeasy.com/product/mcp-gateway/catalog/stripe,
https://portkey.ai/docs/integrations/mcp-servers/stripe-mcp-server, both via search).
Whether the MCP server has Connect tools such as creating transfers is
UNVERIFIED (see section 7). Plan to call the Stripe SDK directly for the money flow.

### 2.4 Agent Toolkit usage (quoted from source)

v0.9.0+ connects to `mcp.stripe.com` and must be awaited. Quoted from
`raw/stripe/tools/typescript/MIGRATION.md` ("Option 1: Factory Function"):

```typescript
import {createStripeAgentToolkit} from '@stripe/agent-toolkit/openai';
// Also available: /ai-sdk, /langchain, /modelcontextprotocol

const toolkit = await createStripeAgentToolkit({
  secretKey: 'rk_test_...',
  configuration: {},
});

const tools = toolkit.getTools();
// ... use tools ...

await toolkit.close(); // Clean up when done
```

Acting on behalf of a connected account (`raw/stripe/tools/README.md`, "Context"):

```typescript
const toolkit = await createStripeAgentToolkit({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  configuration: {
    context: {
      account: "acct_123",
    },
  },
});
```

`Context` also supports `customer` (`raw/stripe/tools/typescript/src/shared/configuration.ts`).
There is no Anthropic-specific adapter in the toolkit: the subpaths are
`/openai`, `/ai-sdk`, `/langchain`, `/modelcontextprotocol`
(`raw/stripe/tools/typescript/MIGRATION.md`). With Claude, either connect
Claude to the MCP server directly or use the `/ai-sdk` adapter with an
Anthropic model provider.

---

## 3. Recommended Connect design for our flow

### 3.1 Summary

| Decision | Recommendation | Source |
|---|---|---|
| API | Accounts v2 (`stripe.v2.core.accounts.create`), no legacy `type` | `raw/stripe/skills/stripe-best-practices/references/connect.md` rule 1; `raw/stripe/skills/connect-recommend/references/account-types.md` |
| Creator account config | `dashboard: 'express'`, `configuration.recipient` with `stripe_balance.stripe_transfers` requested, `fees_collector: 'application'`, `losses_collector: 'application'` | `account-types.md` ("v2 API Example", marketplace), `connect.md` ("Connected account capabilities (v2)") |
| Do NOT request | `configuration.merchant` / `card_payments` for creators (slower onboarding, not needed) | `connect.md`, `account-types.md` |
| Charge pattern | Separate charges and transfers | `charge-patterns.md`, `decision-matrix.md` |
| Platform fee | Transfer less than the charge amount ("transfer math"). Never `application_fee_amount` with this pattern | `connect.md` rule 5 and "Fee economics" |
| Onboarding | Embedded `account_onboarding` component or account links, plus `notification_banner` | `connect.md` ("Onboarding", "Embedded components", rule 4) |
| Readiness check | `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === 'active'` before transferring; not `payouts_enabled` | `connect.md` ("Go-live readiness") |

Stripe's own mapping table lists "Crowdfunding: express / application /
application / Separate charges and transfers / Hold-and-release / delayed
payouts" (`connect.md`, "Business model to configuration mapping"). That is
the closest row to ours.

### 3.2 Create a creator account (verbatim from `account-types.md`)

```javascript
const account = await stripe.v2.core.accounts.create({
  contact_email: 'seller@example.com',
  display_name: 'Seller Name',
  dashboard: 'express',
  identity: { country: 'us', entity_type: 'individual' },
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: { stripe_transfers: { requested: true } },
      },
    },
  },
  defaults: {
    currency: 'usd',
    responsibilities: {
      fees_collector: 'application',
      losses_collector: 'application',
    },
  },
});
```

For `dashboard: 'express'`, give the creator dashboard access through login
links (`connect.md`, "Dashboard defaults").

### 3.3 Brand pays (funds land on the platform)

Pattern from `charge-patterns.md`, "Separate Charges and Transfers", step 1:
a PaymentIntent with no `transfer_data`. Do not pass `payment_method_types`
(`raw/stripe/skills/stripe-best-practices/SKILL.md`, "Critical rules").

```javascript
const paymentIntent = await stripe.paymentIntents.create({
  amount: 10000, // $100.00
  currency: 'usd',
  metadata: {
    orderId: 'order_123',
  },
});
```

For a hosted page, `payments.md` prefers Checkout Sessions for on-session
payments. Tag the deal with a `transfer_group` (e.g. the deal id): per Stripe
docs (search), a PaymentIntent created with `transfer_group` passes the same
value to its charge (https://docs.stripe.com/connect/separate-charges-and-transfers,
via search). How to pass it through Checkout is UNVERIFIED (section 7).

Mark the deal "funded" from the webhook, not from the success page
(`payments.md`, "Webhooks and fulfillment"): `payment_intent.succeeded`, or for
Checkout `checkout.session.completed` plus
`checkout.session.async_payment_succeeded`, gated on `payment_status`.
Verify signatures (`security.md`, "Webhook security").

### 3.4 Post verified: transfer to the creator, keep the fee

Verbatim step 2 from `charge-patterns.md`:

```javascript
const confirmedIntent = event.data.object; // payment_intent.succeeded payload
const transfer = await stripe.transfers.create({
  amount: 8500, // $85.00 to connected account
  currency: 'usd',
  destination: 'acct_connected_account_id',
  source_transaction: confirmedIntent.latest_charge, // charge ID from confirmed PaymentIntent
  metadata: {
    orderId: 'order_123',
  },
});
```

Notes:

- `latest_charge` is null when the PaymentIntent is created; read it from the
  confirmed PaymentIntent (`charge-patterns.md`, code comment). Store it on the
  deal record when the payment webhook arrives, since the transfer happens
  later.
- Fee: the platform keeps `charge amount - transfer amount`
  (`charge-patterns.md`, multi-seller example: "Platform keeps $50").
  Example for our deal: brand pays $1,760, we transfer $1,584, we keep $176
  (10% fee, illustrative). Stripe processing fees on the charge are paid by
  the platform for this charge type (`account-types.md`, "Fee collection
  behavior depends on charge type"; `compatibility-matrix.md`, "Why Blocked
  Combos Fail" point 2). So our net is $176 minus the card fee.
- With `source_transaction`, the transfer succeeds on creation but does not
  execute until the charge's funds are available on the platform
  (https://docs.stripe.com/connect/separate-charges-and-transfers, via search).
- Budget: ten $2,000 deals are ten PaymentIntents (one per deal), which keeps
  refunds per deal simple. Alternatively one $20k charge split by several
  transfers is supported (`charge-patterns.md`, "Multi-seller split"), but then
  partial refunds are needed for the creators who never post. Our pick:
  one charge per deal.

### 3.5 Post never happens: refund the brand

Before any transfer: the money is still on the platform, so refund the charge
on the platform (`charge-patterns.md`, "Refunds": refund source for separate
charges is the platform's balance):

```javascript
const refund = await stripe.refunds.create({
  charge: 'ch_xxx',
});
```

After a transfer (should not happen in our flow, but e.g. a post taken down):
also reverse the transfer, which is manual for this pattern
(`charge-patterns.md`):

```javascript
await stripe.transfers.createReversal('tr_seller_a', {
  amount: 8000,
});
```

Stripe does not auto-reverse transfers on disputes; build explicit reversal
logic (`compatibility-matrix.md`, section "4g"). Stripe does not return the
original processing fee when you refund (https://support.stripe.com/questions/understanding-fees-for-refunded-payments,
via search), so every no-show deal costs the platform the card fee.

### 3.6 How long can funds be held

The repo does NOT state a maximum hold time for funds sitting on the platform
balance under separate charges and transfers. What search found:

| Mechanism | Limit found | Source |
|---|---|---|
| Card authorization with manual capture (`capture_method: manual`) | Authorization expires in 7 days by default, then funds are released and the payment is canceled | https://docs.stripe.com/payments/place-a-hold-on-a-payment-method (search) |
| Connected account manual payouts (funds in the creator's Stripe balance, payout schedule `manual`) | Must pay out within the country's window: US 2 years, Thailand 10 days, other countries 90 days | https://docs.stripe.com/connect/manual-payouts (search) |
| Separate charges and transfers (funds in platform balance) | No limit found | none |
| Funds segregation (holding state on the platform, only transferable to connected accounts) | Private preview, needs header `allocated_funds_preview=v1` and platform-owned negative balances | https://docs.stripe.com/connect/funds-segregation (search) |

Recommendation: capture the payment upfront (automatic capture) and hold on
the platform balance. Do not rely on manual capture, since post deadlines can
be longer than 7 days.

---

## 4. Pricing (fetched via search on 2026-09-28, must be re-checked)

All numbers below came from WebSearch result snippets on 2026-09-28. stripe.com
itself was blocked from this sandbox, so none were read on the page. Re-check
before quoting to anyone.

| Item | Price | Source |
|---|---|---|
| US online card, domestic | 2.9% + 30c per successful charge; more for international cards, manual entry, currency conversion | https://stripe.com/pricing ; https://checkoutpage.com/blog/stripe-processing-fees (third party) |
| Refunds | Original processing fee is not returned | https://support.stripe.com/questions/understanding-fees-for-refunded-payments |
| Connect, "Stripe handles pricing" | No extra Connect fee for the platform; Stripe bills connected accounts directly | https://stripe.com/connect/pricing ; https://support.stripe.com/questions/monetizing-payments-with-stripe-connect |
| Connect, "you handle pricing" | $2 per monthly active account, plus 0.25% + 25c per payout. An account is active in any month payouts are sent to its bank account or debit card. Also covers platforms that went live before April 2024 on Express or Custom | https://stripe.com/connect/pricing |
| Instant Payouts via Connect | 1% of the payout for marketplaces and platforms (snippet) | https://docs.stripe.com/connect/instant-payouts |
| Instant Payouts, US Dashboard users / Standard connected accounts | 1.5% (up from 1% on 2024-06-01) | https://support.stripe.com/questions/june-2024-pricing-update-for-instant-payouts-for-businesses-in-the-united-states |
| Stripe Atlas | $500 one time (Delaware incorporation, EIN, first year of registered agent); registered agent $100/yr after | https://stripe.com/atlas ; https://sparklaun.ch/compare/stripe-atlas (third party). Third-party claims (state fee $109, $2,500 credits, fee refund on a $5k Treasury deposit) are unverified |
| Agentic Commerce Protocol | The protocol itself is open source (Apache 2.0), no per-transaction protocol fee; normal processing fees still apply | https://flexprice.io/blog/stripe-pricing-breakdown-2026 (third party). No Stripe page with an SPT or agentic price was found |
| Shared Payment Tokens, Issuing for agents, Link wallet for agents | No price found | https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens (search) |

Which Connect pricing bucket we fall into with `fees_collector: 'application'`
is not stated in the repo. See section 7.

---

## 5. Agentic payments context (for the pitch, not the build)

Nothing in the repo covers Shared Payment Tokens, Link for agents or Issuing
for agents. From search only:

- Shared Payment Tokens (SPTs) let an agent start a payment with the buyer's
  permission and payment method without exposing credentials. They can be
  scoped to a business, limited by time or amount, revoked, and monitored by
  webhook (https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens,
  https://stripe.com/blog/introducing-our-agentic-commerce-solutions, search).
- Link's wallet for agents and Issuing for agents were announced at Sessions,
  2026-04-29. They give agents one-time-use cards or SPTs after the user
  approves each spend in Link (https://stripe.com/blog/everything-we-announced-at-sessions-2026,
  https://techcrunch.com/2026/04/30/stripe-link-digital-wallet-ai-agents-shopping/, search).
- `stripe pay` (in the repo) sends money between Stripe businesses by
  Stripe Profile handle. It needs a funded financial account on the sender
  side, and its safety rules require explicit user confirmation before
  sending (`raw/stripe/skills/stripe-pay/SKILL.md`). It is B2B and not our
  creator payout path.

For the demo, the "agent commits money" moment is the brand agent creating
the PaymentIntent or Checkout Session within its budget, plus the
verification agent triggering `transfers.create`. That uses only Connect
primitives from section 3.

---

## 6. Gotchas

1. Do not use destination charges for hold-then-pay: they transfer
   automatically on payment success (`charge-patterns.md`).
2. Do not use `application_fee_amount` with separate charges and transfers.
   Transfer less instead (`connect.md` rule 5).
3. `losses_collector: 'stripe'` with separate charges and transfers is
   BLOCKED, and Express dashboard with `losses_collector: 'stripe'` is
   rejected by the API for non-direct charges (`connect.md`, "Compatibility
   constraints"; `account-types.md`).
4. Conflicting advice inside the repo:
   `raw/stripe/skills/stripe-best-practices/references/security.md` ("Connect
   security") says Standard is the safer default and not to recommend Express
   or Custom without a specific need. `connect.md` and `connect-recommend`
   say to use v2 with the Express dashboard for marketplaces, and that
   hold-and-release needs platform-owned losses. For our hold-then-pay flow
   the Connect files win, because Standard-like (`losses_collector: 'stripe'`)
   is blocked for separate charges. We accept liability for disputes.
5. Stale README: `raw/stripe/tools/typescript/README.md` and
   `raw/stripe/tools/typescript/examples/ai-sdk/index.ts` still show
   `new StripeAgentToolkit(...)` with sync `getTools()`. Per `MIGRATION.md`
   (v0.9.0+), sync use throws "StripeAgentToolkit not initialized"; use
   `await createStripeAgentToolkit(...)`.
6. The toolkit has no offline fallback. It fetches tools from
   `mcp.stripe.com` and fails if unreachable (`MIGRATION.md`, point 2;
   `raw/stripe/tools/typescript/src/shared/constants.ts`). Check that the
   hosting network (e.g. Cloudflare Workers) can reach it.
7. The toolkit's `configuration.actions` was removed. Tool scope is set only
   by the restricted key's permissions (`MIGRATION.md`, point 5).
8. Pending balance: in test mode, normal test cards land in the pending
   balance, so a transfer with `source_transaction` waits. Test card
   `4000000000000077` adds funds directly to the available balance
   (https://docs.stripe.com/testing, search). Use it for the live demo.
9. Automatic payouts on the platform can drain the balance that transfers
   without `source_transaction` rely on (https://docs.stripe.com/connect/separate-charges-and-transfers,
   search). Always set `source_transaction`.
10. Cross-border: transfers on the payments balance are supported between
    US, CA, UK, EEA and CH. Otherwise the platform and the connected account
    must be in the same region (https://docs.stripe.com/connect/charges, search).
    Non-US creators may not work.
11. Never pass `payment_method_types`; never use the Charges API
    (`payments.md`).
12. Webhooks are required, not optional (`payments.md`,
    `raw/stripe/skills/stripe-best-practices/SKILL.md`).
13. Refunds do not return Stripe's fee, so each failed deal costs the
    platform about 2.9% + 30c (section 4).
14. Use `configuration.recipient...stripe_transfers.status`, not
    `payouts_enabled` / `charges_enabled` (`connect.md`, "Go-live readiness").
15. With Express + separate charges, creators cannot handle refunds or
    disputes from their dashboard. The platform must run them via webhooks
    (`compatibility-matrix.md`, CAUTION rows).

---

## 7. Open questions / unverified

Nothing below is confirmed from a Stripe source. Check each one before
relying on it.

- Maximum time funds may sit in the platform balance before transfer under
  separate charges and transfers. No limit found; the 90-day / 2-year numbers
  are for connected-account manual payouts, not platform holds.
- Exact v2 account-link / onboarding call for Accounts v2 (the repo names
  "account links" and `account_onboarding` but gives no code). In particular
  whether `stripe.accountLinks.create` (v1) works for v2 accounts or a v2
  endpoint is needed.
- Whether Checkout Sessions accept `payment_intent_data.transfer_group` for
  tagging a deal. Not in the repo.
- Whether the Stripe MCP server / Agent Toolkit exposes Connect tools
  (create transfer, create connected account). The repo defers to
  https://docs.stripe.com/mcp#tools, which was blocked.
- Which Connect pricing bucket applies to a v2 account with
  `fees_collector: 'application'`. We assume "you handle pricing" ($2 per
  active account per month + 0.25% + 25c per payout), but that is inference.
- Instant Payouts price for Connect platforms: search snippets gave both 1%
  (Connect) and 1.5% (US Dashboard / Standard). Confirm on stripe.com/connect/pricing.
- Pricing for Shared Payment Tokens, Issuing for agents and Link's wallet
  for agents. None found.
- Whether canceling an uncaptured (manual-capture) PaymentIntent avoids the
  processing fee. Not checked.
- Whether Accounts v2 is fully available in test mode sandboxes created by
  `stripe sandbox create`. Not checked.
- Whether the connected account's own payouts (to the creator's bank) cost
  anything to the creator under our config. Not in the repo.
- Legal / money-transmission implications of the platform holding brand
  funds for weeks. Out of Stripe's docs; ask Stripe or counsel for a real launch.
