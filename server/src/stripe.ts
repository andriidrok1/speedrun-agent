// Thin wrappers over the Stripe SDK for the Creator Deals flow.
// Pattern: separate charges and transfers (see reference/stripe.md, section 3).
// Works in a Cloudflare Worker (fetch-based http client) and in Node scripts (tsx).
//
// Flow per deal:
//   ensureCreatorAccount  -> Connect Express account for the creator (once per creator)
//   chargeBrand           -> PaymentIntent on the platform, funds held here
//   payoutCreator         -> transfers.create to the creator, platform keeps the fee
//   refundBrand           -> refund the PaymentIntent if the post never goes live

import Stripe from 'stripe';

export type { Stripe };

export function makeStripe(secretKey: string): Stripe {
  if (!secretKey) throw new Error('makeStripe: empty secret key');
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
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

export type AccountType = 'express' | 'custom';

export type EnsureCreatorAccountArgs = {
  slug: string;
  name: string;
  email: string;
  /** Default 'express'. 'custom' is a fallback if Express refuses prefilled test data. */
  type?: AccountType;
  log?: (msg: string) => void;
};

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: 'Creator' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

async function findAccountBySlug(stripe: Stripe, slug: string): Promise<Stripe.Account | null> {
  // Scan up to 500 accounts. Fine for a hackathon platform.
  let seen = 0;
  for await (const acct of stripe.accounts.list({ limit: 100 })) {
    if (acct.metadata?.slug === slug) return acct;
    if (++seen >= 500) break;
  }
  return null;
}

function transfersStatus(acct: Stripe.Account): string {
  return acct.capabilities?.transfers ?? 'missing';
}

/**
 * Creates (or finds, by metadata.slug) a Connect account for a creator and returns its id.
 * Test mode: prefills the individual so `capabilities.transfers` can go active without onboarding.
 * If Stripe still wants more, `requirements.currently_due` is logged so the human knows what to fill.
 */
export async function ensureCreatorAccount(
  stripe: Stripe,
  { slug, name, email, type = 'express', log = console.log }: EnsureCreatorAccountArgs,
): Promise<string> {
  try {
    const existing = await findAccountBySlug(stripe, slug);
    if (existing) {
      log(`[stripe] account for ${slug} exists: ${existing.id} (transfers=${transfersStatus(existing)})`);
      if (transfersStatus(existing) !== 'active') logRequirements(existing, log);
      return existing.id;
    }
  } catch (e) {
    rethrow('accounts.list', { slug }, e);
  }

  // Accounts v2 first (Stripe's current recommendation; v1 `type: 'express'` is refused on new
  // platforms unless a dashboard toggle is on). Falls through to v1 if v2 is unavailable.
  try {
    const acct2 = await createAccountV2(stripe, { slug, name, email });
    log(`[stripe] v2 account for ${slug}: ${acct2.id}`);
    return acct2.id;
  } catch (e) {
    log(`[stripe] v2.core.accounts.create rejected, falling back to v1: ${errMsg(e)}`);
  }

  const { first, last } = splitName(name);
  const ip = '8.8.8.8';
  const base: Stripe.AccountCreateParams = {
    type,
    country: 'US',
    email,
    capabilities: { transfers: { requested: true } },
    business_type: 'individual',
    metadata: { slug },
    business_profile: {
      name,
      product_description: 'Sponsored social media content for brands',
      url: `https://instagram.com/${slug}`,
      mcc: '7311', // advertising services
    },
    individual: {
      first_name: first,
      last_name: last,
      email,
      phone: '+15555550100',
      dob: { day: 1, month: 1, year: 1995 },
      address: { line1: '123 Market St', city: 'San Francisco', state: 'CA', postal_code: '94103', country: 'US' },
      ssn_last_4: '0000',
      id_number: '000000000', // test-mode value that verifies immediately
    },
    // Test-mode bank account that verifies immediately.
    external_account: {
      object: 'bank_account',
      country: 'US',
      currency: 'usd',
      routing_number: '110000000',
      account_number: '000123456789',
      account_holder_name: name,
      account_holder_type: 'individual',
    },
    settings: { payouts: { schedule: { interval: 'manual' } } },
  };
  // Express accounts: Stripe normally collects ToS itself. We still try to prefill it in test mode
  // and drop it if the API refuses.
  const withTos: Stripe.AccountCreateParams = {
    ...base,
    tos_acceptance: { date: Math.floor(Date.now() / 1000), ip },
  };

  let acct: Stripe.Account;
  try {
    acct = await stripe.accounts.create(withTos);
  } catch (e) {
    const msg = errMsg(e);
    log(`[stripe] accounts.create(${type}, with tos_acceptance) rejected: ${msg}`);
    log('[stripe] retrying without tos_acceptance');
    try {
      acct = await stripe.accounts.create(base);
    } catch (e2) {
      rethrow('accounts.create', { slug, type }, e2);
    }
  }

  log(`[stripe] created ${type} account ${acct.id} for ${slug} (transfers=${transfersStatus(acct)})`);

  if (transfersStatus(acct) !== 'active') {
    // Capability may go active a moment after creation. Re-read once and report what is still due.
    try {
      const fresh = await stripe.accounts.retrieve(acct.id);
      log(`[stripe] re-read ${fresh.id}: transfers=${transfersStatus(fresh)}`);
      if (transfersStatus(fresh) !== 'active') logRequirements(fresh, log);
    } catch (e) {
      log(`[stripe] accounts.retrieve(${acct.id}) failed: ${errMsg(e)}`);
    }
  }
  return acct.id;
}

function logRequirements(acct: Stripe.Account, log: (m: string) => void): void {
  const r = acct.requirements;
  log(`[stripe] ${acct.id} requirements: currently_due=${JSON.stringify(r?.currently_due ?? [])}`
    + ` past_due=${JSON.stringify(r?.past_due ?? [])}`
    + ` pending_verification=${JSON.stringify(r?.pending_verification ?? [])}`
    + ` disabled_reason=${r?.disabled_reason ?? 'none'}`);
  if (r?.errors?.length) log(`[stripe] ${acct.id} requirement errors: ${JSON.stringify(r.errors)}`);
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
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`stripe.chargeBrand: bad amount (dealId=${dealId} amountUsd=${amountUsd})`);
  }
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        description,
        payment_method: 'pm_card_visa',
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
  log?: (msg: string) => void;
};

/**
 * Transfer the net amount (gross minus platform fee) to the creator's connected account.
 * `source_transaction` ties the transfer to the brand's charge so it can be created while the
 * charge is still pending on the platform balance. If Stripe rejects it, retry once without it
 * (then it draws from the available balance) and log loudly: that is a question for the Stripe rep.
 */
export async function payoutCreator(
  stripe: Stripe,
  { dealId, accountId, amountUsd, feePct, chargeId, log = console.log }: PayoutCreatorArgs,
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
    const tr = await stripe.transfers.create(params, { idempotencyKey: `transfer:${dealId}:src` });
    return { transferId: tr.id, netUsd: fromCents(net) };
  } catch (e) {
    const se = e as { type?: string; param?: string; code?: string };
    const msg = errMsg(e);
    const isSrcRejection = se.type === 'StripeInvalidRequestError' && (se.param === 'source_transaction' || /source_transaction|capabilit/i.test(msg));
    if (!isSrcRejection) rethrow('payoutCreator', { dealId, accountId, amountUsd, chargeId }, e);
    log(`[stripe] transfers.create with source_transaction=${chargeId} rejected (dealId=${dealId}): ${msg}`);
    log('[stripe] OPEN QUESTION for Stripe rep: why was source_transaction rejected? Retrying without it (draws from available balance).');
    const { source_transaction: _drop, ...noSource } = params;
    void _drop;
    try {
      const tr = await stripe.transfers.create(noSource, { idempotencyKey: `transfer:${dealId}:nosrc` });
      log(`[stripe] transfer ${tr.id} created WITHOUT source_transaction`);
      return { transferId: tr.id, netUsd: fromCents(net) };
    } catch (e2) {
      rethrow('payoutCreator', { dealId, accountId, amountUsd, netUsd: fromCents(net), chargeId }, e2);
    }
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
  const v2 = (stripe as unknown as { v2?: { core?: { accounts?: { create: (p: Record<string, unknown>) => Promise<{ id: string }> } } } }).v2;
  if (!v2?.core?.accounts) throw new Error('stripe SDK has no v2.core.accounts');
  const { first, last } = splitName(name);
  return v2.core.accounts.create({
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
      attestations: { terms_of_service: { account: { date: new Date().toISOString(), ip: '8.8.8.8' } } },
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
  });
}
