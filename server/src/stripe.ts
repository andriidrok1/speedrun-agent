// Thin wrappers over the Stripe SDK for the Creator Deals flow.
// Pattern: separate charges and transfers (see reference/stripe.md, section 3).
// Works in a Cloudflare Worker (fetch-based http client) and in Node scripts (tsx).
//
// Flow per deal:
//   ensureCreatorAccount  -> Connect (Accounts v2) recipient for the creator (once per creator)
//   chargeBrand           -> PaymentIntent on the platform, funds held here
//   payoutCreator         -> transfers.create to the creator, platform keeps the fee
//   refundBrand           -> refund the PaymentIntent if the post never goes live

import Stripe from 'stripe';

export type { Stripe };

export function makeStripe(secretKey: string): Stripe {
  if (!secretKey) throw new Error('makeStripe: empty secret key');
  // Test mode only: this server confirms charges with Stripe test cards.
  if (!/^(sk|rk)_test_/.test(secretKey)) throw new Error('makeStripe: only test-mode keys (sk_test_ / rk_test_) are allowed');
  return new Stripe(secretKey, {
    apiVersion: '2026-08-26.dahlia',
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    // Stay well under the Durable Object's 30 s blockConcurrencyWhile limit.
    timeout: 10_000,
  });
}

export const toCents = (usd: number): number => Math.round(usd * 100);
export const fromCents = (cents: number): number => cents / 100;

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Wrap any Stripe error so the message carries the deal and the amount. */
function rethrow(step: string, ctx: Record<string, unknown>, e: unknown): never {
  const parts = Object.entries(ctx).map(([k, v]) => `${k}=${String(v)}`).join(' ');
  const err = new Error(`stripe.${step} failed (${parts}): ${errMsg(e)}`);
  (err as Error & { cause?: unknown }).cause = e;
  throw err;
}

export type EnsureCreatorAccountArgs = {
  slug: string;
  name: string;
  email: string;
  log?: (msg: string) => void;
};

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: 'Creator' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * `stripe_transfers` status for a connected account: 'active' means it can receive our payout.
 * Reads the Accounts v2 recipient configuration; accounts made by older v1 runs fall back to
 * `capabilities.transfers`.
 */
export async function creatorTransfersStatus(stripe: Stripe, accountId: string): Promise<string> {
  try {
    const a = await stripe.v2.core.accounts.retrieve(accountId, { include: ['configuration.recipient'] });
    return a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? 'missing';
  } catch {
    try {
      const a = await stripe.accounts.retrieve(accountId);
      return a.capabilities?.transfers ?? 'missing';
    } catch (e) {
      rethrow('creatorTransfersStatus', { accountId }, e);
    }
  }
}

/** First account tagged with this slug that can receive transfers. Stale or inactive ones are skipped. */
async function findAccountBySlug(stripe: Stripe, slug: string, log: (m: string) => void): Promise<string | null> {
  // Scan up to 500 accounts. Fine for a hackathon platform.
  let seen = 0;
  for await (const acct of stripe.accounts.list({ limit: 100 })) {
    if (acct.metadata?.slug === slug) {
      const status = await creatorTransfersStatus(stripe, acct.id);
      if (status === 'active') return acct.id;
      log(`[stripe] skipping ${acct.id} for ${slug}: stripe_transfers=${status}`);
    }
    if (++seen >= 500) break;
  }
  return null;
}

/**
 * Finds (by metadata.slug) or creates the creator's Accounts v2 recipient and returns its id.
 * No v1 fallback: a v1 Express account cannot take a platform ToS attestation, so its transfers
 * capability stays inactive until the creator onboards, and the payout would fail after the charge.
 */
export async function ensureCreatorAccount(
  stripe: Stripe,
  { slug, name, email, log = console.log }: EnsureCreatorAccountArgs,
): Promise<string> {
  let existing: string | null;
  try {
    existing = await findAccountBySlug(stripe, slug, log);
  } catch (e) {
    rethrow('accounts.list', { slug }, e);
  }
  if (existing) {
    log(`[stripe] account for ${slug} exists: ${existing}`);
    return existing;
  }
  try {
    const acct = await createAccountV2(stripe, { slug, name, email });
    log(`[stripe] v2 account for ${slug}: ${acct.id}`);
    return acct.id;
  } catch (e) {
    rethrow('v2.core.accounts.create', { slug }, e);
  }
}

export type ChargeBrandArgs = { dealId: string; amountUsd: number; description: string };

/**
 * Brand pays the deal price to the platform. Test card, confirmed server-side, no redirects.
 * Funds stay on the platform balance until payoutCreator / refundBrand.
 */
export async function chargeBrand(
  stripe: Stripe,
  { dealId, amountUsd, description }: ChargeBrandArgs,
): Promise<{ paymentIntentId: string; chargeId: string }> {
  const amount = toCents(amountUsd);
  if (!Number.isInteger(amount) || amount < 50) {
    throw new Error(`stripe.chargeBrand: bad amount, Stripe's minimum is $0.50 (dealId=${dealId} amountUsd=${amountUsd})`);
  }
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        description,
        // Test card 4000 0000 0000 0077: funds skip the pending balance, so they show as available.
        payment_method: 'pm_card_bypassPending',
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { dealId },
        transfer_group: dealId,
        expand: ['latest_charge'],
      },
      { idempotencyKey: `charge:${dealId}` },
    );
    if (pi.status !== 'succeeded') {
      throw new Error(`PaymentIntent ${pi.id} status=${pi.status}, expected succeeded`);
    }
    const lc = pi.latest_charge;
    const chargeId = typeof lc === 'string' ? lc : lc?.id;
    if (!chargeId) throw new Error(`PaymentIntent ${pi.id} has no latest_charge`);
    return { paymentIntentId: pi.id, chargeId };
  } catch (e) {
    rethrow('chargeBrand', { dealId, amountUsd }, e);
  }
}

export type PayoutCreatorArgs = {
  dealId: string;
  accountId: string;
  amountUsd: number;
  /** Platform fee in percent, e.g. 10 for 10%. */
  feePct: number;
  chargeId: string;
};

/**
 * Transfer the net amount (gross minus platform fee) to the creator's connected account.
 * `source_transaction` ties the transfer to the brand's charge so it can be created while the
 * charge is still pending on the platform balance. No retry without it: that would draw from the
 * available balance instead, which fails while the charge is pending.
 */
export async function payoutCreator(
  stripe: Stripe,
  { dealId, accountId, amountUsd, feePct, chargeId }: PayoutCreatorArgs,
): Promise<{ transferId: string; netUsd: number }> {
  if (!Number.isFinite(feePct) || feePct < 0 || feePct >= 100) {
    throw new Error(`stripe.payoutCreator: bad feePct ${feePct} (dealId=${dealId} amountUsd=${amountUsd})`);
  }
  const gross = toCents(amountUsd);
  const fee = Math.round((gross * feePct) / 100);
  const net = gross - fee;
  if (net <= 0) {
    throw new Error(`stripe.payoutCreator: net <= 0 (dealId=${dealId} amountUsd=${amountUsd} feePct=${feePct})`);
  }
  const params: Stripe.TransferCreateParams = {
    amount: net,
    currency: 'usd',
    destination: accountId,
    transfer_group: dealId,
    source_transaction: chargeId,
    metadata: { dealId, feePct: String(feePct), grossUsd: String(amountUsd) },
    description: `Creator payout for deal ${dealId}`,
  };
  try {
    const tr = await stripe.transfers.create(params, { idempotencyKey: `transfer:${dealId}` });
    return { transferId: tr.id, netUsd: fromCents(net) };
  } catch (e) {
    rethrow('payoutCreator', { dealId, accountId, amountUsd, chargeId }, e);
  }
}

export type RefundBrandArgs = { dealId: string; paymentIntentId: string };

/** Refund the brand's payment in full. Only valid before any transfer for this deal. */
export async function refundBrand(
  stripe: Stripe,
  { dealId, paymentIntentId }: RefundBrandArgs,
): Promise<{ refundId: string }> {
  try {
    const r = await stripe.refunds.create(
      { payment_intent: paymentIntentId, metadata: { dealId } },
      { idempotencyKey: `refund:${dealId}` },
    );
    return { refundId: r.id };
  } catch (e) {
    rethrow('refundBrand', { dealId, paymentIntentId }, e);
  }
}

export type BalanceUsd = { availableUsd: number; pendingUsd: number };

function sumUsd(rows: Array<{ amount: number; currency: string }>): number {
  return fromCents(rows.filter((r) => r.currency === 'usd').reduce((s, r) => s + r.amount, 0));
}

/** Platform balance in USD. Pass `stripeAccount` to read a connected account instead. */
export async function platformBalance(stripe: Stripe, stripeAccount?: string): Promise<BalanceUsd> {
  try {
    const b = await stripe.balance.retrieve({}, stripeAccount ? { stripeAccount } : undefined);
    return { availableUsd: sumUsd(b.available), pendingUsd: sumUsd(b.pending) };
  } catch (e) {
    rethrow('platformBalance', { stripeAccount: stripeAccount ?? 'platform' }, e);
  }
}

// ---- Accounts v2 ---------------------------------------------------------------------------------
// Verified 2026-09-28 in test mode: with dashboard 'none' the platform owns requirement collection,
// so it can attest ToS and prefill identity; `stripe_transfers` comes back `active` immediately.
// (dashboard 'express' makes Stripe own collection and the ToS attestation is refused.)
async function createAccountV2(stripe: Stripe, { slug, name, email }: { slug: string; name: string; email: string }) {
  const { first, last } = splitName(name);
  const day = new Date().toISOString().slice(0, 10);
  // Same params and key for the whole day: two deals for one creator racing here get one account.
  return stripe.v2.core.accounts.create(
    {
      contact_email: email,
      display_name: name,
      dashboard: 'none',
      identity: {
        country: 'us',
        entity_type: 'individual',
        individual: {
          given_name: first,
          surname: last,
          date_of_birth: { day: 1, month: 1, year: 1995 },
          id_numbers: [{ type: 'us_ssn_last_4', value: '0000' }],
          address: { line1: '123 Market St', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'us' },
        },
        attestations: { terms_of_service: { account: { date: `${day}T00:00:00.000Z`, ip: '8.8.8.8' } } },
      },
      configuration: {
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      defaults: {
        currency: 'usd',
        responsibilities: { fees_collector: 'application', losses_collector: 'application' },
        profile: { business_url: `https://instagram.com/${slug}` },
      },
      metadata: { slug },
    },
    { idempotencyKey: `acct:${slug}:${day}` },
  );
}
