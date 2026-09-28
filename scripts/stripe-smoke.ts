// Stripe smoke test. Run from the server package so the SDK resolves:
//   cd server && npx tsx ../scripts/stripe-smoke.ts            # full: account -> charge -> transfer
//   cd server && npx tsx ../scripts/stripe-smoke.ts --check    # balance only
//   cd server && npx tsx ../scripts/stripe-smoke.ts --refund   # account -> charge -> refund
//   add --custom to create a Custom (not Express) account if Express refuses prefilled test data
//
// Reads STRIPE_SECRET_KEY from server/.dev.vars (KEY=VALUE lines). Never prints the key.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeStripe, ensureCreatorAccount, chargeBrand, payoutCreator, refundBrand, platformBalance,
} from '../server/src/stripe';

const here = dirname(fileURLToPath(import.meta.url));
const devVarsPath = resolve(here, '../server/.dev.vars');

function loadDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

const vars = loadDevVars(devVarsPath);
const key = process.env.STRIPE_SECRET_KEY || vars.STRIPE_SECRET_KEY || '';
const feePct = Number(process.env.PLATFORM_FEE_PCT || vars.PLATFORM_FEE_PCT || '10');

const args = new Set(process.argv.slice(2));
const mode: 'check' | 'refund' | 'full' = args.has('--check') ? 'check' : args.has('--refund') ? 'refund' : 'full';
const accountType = args.has('--custom') ? 'custom' : 'express';

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  if (!key) {
    console.error(`No STRIPE_SECRET_KEY. Expected in ${devVarsPath} or env. Nothing ran.`);
    process.exit(2);
  }
  if (!/^(sk|rk)_test_/.test(key)) {
    console.error(`STRIPE_SECRET_KEY does not look like a test key (prefix ${key.slice(0, 8)}...). Refusing to run.`);
    process.exit(2);
  }
  const stripe = makeStripe(key);

  const before = await platformBalance(stripe);
  console.log(`platform balance: available ${usd(before.availableUsd)}, pending ${usd(before.pendingUsd)}`);
  if (mode === 'check') return;

  const ts = Date.now();
  const dealId = `smoke-${ts}`;
  const amountUsd = 3400;
  console.log(`\nmode=${mode} deal=${dealId} amount=${usd(amountUsd)} fee=${feePct}% account=${accountType}`);

  console.log('\n1. creator account');
  const accountId = await ensureCreatorAccount(stripe, {
    slug: 'maya-wears', name: 'Maya Ortiz', email: 'maya@example.com', type: accountType,
  });
  console.log(`   accountId=${accountId}`);

  console.log('\n2. brand pays');
  const { paymentIntentId, chargeId } = await chargeBrand(stripe, {
    dealId, amountUsd, description: `Creator deal ${dealId}: Maya Ortiz x brand`,
  });
  console.log(`   paymentIntentId=${paymentIntentId} chargeId=${chargeId} amount=${usd(amountUsd)}`);

  let transferId = '';
  let netUsd = 0;
  let refundId = '';

  if (mode === 'full') {
    console.log('\n3. post verified -> payout creator');
    const r = await payoutCreator(stripe, { dealId, accountId, amountUsd, feePct, chargeId });
    transferId = r.transferId;
    netUsd = r.netUsd;
    console.log(`   transferId=${transferId} net=${usd(netUsd)} platform keeps ${usd(amountUsd - netUsd)}`);

    const acctBal = await platformBalance(stripe, accountId);
    console.log(`   connected account balance: available ${usd(acctBal.availableUsd)}, pending ${usd(acctBal.pendingUsd)}`);
  } else {
    console.log('\n3. post never happened -> refund brand');
    const r = await refundBrand(stripe, { dealId, paymentIntentId });
    refundId = r.refundId;
    console.log(`   refundId=${refundId} amount=${usd(amountUsd)}`);
  }

  const after = await platformBalance(stripe);

  console.log('\n=== summary (check in Stripe Dashboard, test mode) ===');
  console.log(`deal            ${dealId}`);
  console.log(`payment         ${paymentIntentId}  ${usd(amountUsd)}  (charge ${chargeId})`);
  console.log(`creator account ${accountId}  (maya-wears, ${accountType})`);
  if (transferId) console.log(`transfer        ${transferId}  ${usd(netUsd)}  (fee ${feePct}% = ${usd(amountUsd - netUsd)})`);
  if (refundId) console.log(`refund          ${refundId}  ${usd(amountUsd)}`);
  console.log(`platform bal    before: avail ${usd(before.availableUsd)} / pending ${usd(before.pendingUsd)}`);
  console.log(`                after:  avail ${usd(after.availableUsd)} / pending ${usd(after.pendingUsd)}`);
}

main().catch((e) => {
  console.error('\nSMOKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
