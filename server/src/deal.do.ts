// DealDO: one per deal. Runs the negotiation, stores the transcript, and owns every status
// transition that moves money (fund / verify+payout / expire+refund) so state and Stripe never race.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import type { BrandProfile, Creator, CreatorProfile, Deal, DealStatus, Offer, Turn } from './types';
import { BRANDS, CREATORS, BRAND_NARRATIVES, CREATOR_NARRATIVES } from './profiles.bundle';
import { runNegotiation, type NegotiationResult } from './engine/index';
import { runNegotiationLLM } from './agents/negotiate';
import { createClient } from './agents/llm';
import { makeStripe, ensureCreatorAccount, creatorTransfersStatus, chargeBrand, payoutCreator, refundBrand } from './stripe';
import { verifyPostLive, mockVerify, type VerifyResult } from './verify';
import { fail } from './campaign.do';
import { profileFromScraped, brandForCreator, creatorForBrand, fitCheck } from './pricing';

// ---- negotiation strategy -----------------------------------------------------------------------
// LLM (OpenAI) when OPENAI_API_KEY is set and LLM_MODE != 'off', otherwise the deterministic engine.
// Either way the engine's rules decide what is legal; the LLM only picks the package and writes text.
type NegotiateOpts = { onTurn: (t: Turn) => void; log?: (line: string) => void };

export async function negotiate(
  env: Env, slugs: { brandSlug: string; creatorSlug: string },
  brand: BrandProfile, creator: CreatorProfile, now: Date, opts: NegotiateOpts,
): Promise<NegotiationResult & { mode: 'llm' | 'engine' }> {
  const useLlm = !!env.OPENAI_API_KEY && env.LLM_MODE !== 'off';
  if (!useLlm) {
    const r = runNegotiation({ brand, creator, now });
    for (const t of r.turns) opts.onTurn(t);
    return { ...r, mode: 'engine' };
  }
  const brandNarrative = BRAND_NARRATIVES[slugs.brandSlug] ?? `${brand.public.name}: ${brand.public.brand_voice}`;
  const creatorNarrative = CREATOR_NARRATIVES[slugs.creatorSlug] ?? `${creator.public.name} (${creator.public.handle}): ${creator.public.content_style}`;
  const client = createClient(env.OPENAI_API_KEY!, env.OPENAI_MODEL || undefined);
  const r = await runNegotiationLLM({
    brand, creator, brandNarrative, creatorNarrative, now, client,
    onTurn: opts.onTurn, log: opts.log ?? ((l) => console.log(`[negotiate] ${l}`)),
  });
  return { ...r, mode: 'llm' };
}
// -------------------------------------------------------------------------------------------------

export type CreateDealArgs = {
  dealId: string;
  campaignId: string;
  brandSlug: string;
  creatorSlug: string;
  /** Raha's scraper output. Used only when creatorSlug has no bundled profile. */
  creator?: Creator;
  /** Full profile from creator onboarding. Wins over the bundled and scraped profiles. */
  creatorProfile?: CreatorProfile;
  /** Web app deals: both sides must POST /deals/:id/approve before fund. Agent flows leave it off. */
  requireApproval?: boolean;
};

/** Stored deal: the shared Deal contract plus fields only this side needs. */
export type DealRecord = Deal & {
  walkReason?: string;
  stripe?: Deal['stripe'] & { chargeId?: string };
  /** When a held deal auto-refunds if the post was never verified (ISO). */
  holdUntil?: string;
  /** walkReason not_a_fit: why the two sides never started talking. */
  fitReasons?: string[];
  /** No price could close it: brand max below creator minimum by this much cash (walkReason budget_gap). */
  gap_usd?: number;
  /** Present when the deal needs both humans to accept before payment. */
  approvals?: { brand: boolean; creator: boolean };
  /** Profile used to negotiate when the creator has no bundled profile (onboarded or derived from
   *  the scraped Creator). Kept so the market layer can score the deal later. */
  creatorProfile?: CreatorProfile;
};
export type DealWithTurns = DealRecord & { turns: Turn[] };
export type VerifyOutcome = { verified: boolean; deal: DealRecord; verify: VerifyResult };

type MessageRow = {
  seq: number; round: number; from_side: string; ts: string; offer_json: string;
  message: string; value_brand: number; value_creator: number; status: string;
};

export class DealDO extends DurableObject<Env> {
  private sql: SqlStorage;
  /** True while a background negotiation is in flight in this DO instance. */
  private running = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS deal (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      seq INTEGER PRIMARY KEY,
      round INTEGER NOT NULL,
      from_side TEXT NOT NULL,
      ts TEXT NOT NULL,
      offer_json TEXT NOT NULL,
      message TEXT NOT NULL,
      value_brand REAL NOT NULL,
      value_creator REAL NOT NULL,
      status TEXT NOT NULL
    )`);
  }

  // ---- create: negotiate now, reserve budget -------------------------------------------------

  async create(args: CreateDealArgs): Promise<DealRecord> {
    if (this.load()) fail(409, `deal ${args.dealId} already exists`);
    const campaign = this.campaign(args.campaignId);
    const baseBrand = BRANDS[args.brandSlug] ?? (await campaign.brandProfile());
    if (!baseBrand) fail(404, `deal ${args.dealId}: unknown brand ${args.brandSlug}`);
    const baseCreator = args.creatorProfile ?? CREATORS[args.creatorSlug] ?? (args.creator ? profileFromScraped(args.creatorSlug, args.creator) : null);
    if (!baseCreator) fail(404, `deal ${args.dealId}: unknown creator ${args.creatorSlug} (pass a Creator object to negotiate with a scraped profile)`);
    // Favorite brands get the creator's lower floors; then cap the brand at 1.3x the creator's rate card.
    const creator = creatorForBrand(baseCreator, baseBrand);
    const brand = brandForCreator(baseBrand, creator);

    const snapshot = await campaign.get(); // 404 if the campaign was never created

    const now = new Date();
    const ts = now.toISOString();
    const deal: DealRecord = {
      dealId: args.dealId,
      campaignId: args.campaignId,
      brandSlug: args.brandSlug,
      creatorSlug: args.creatorSlug,
      status: 'negotiating',
      price: 0,
      budgetLeft: snapshot.budgetLeft,
      createdAt: ts,
      updatedAt: ts,
    };
    if (!CREATORS[args.creatorSlug]) deal.creatorProfile = creator;
    if (args.requireApproval) deal.approvals = { brand: false, creator: false };
    this.save(deal);
    await this.market().register({ dealId: deal.dealId, campaignId: deal.campaignId, brandSlug: deal.brandSlug, creatorSlug: deal.creatorSlug, createdAt: ts });

    // Fit first: two sides whose descriptions clash never start a conversation.
    const fit = fitCheck(baseBrand, creator);
    if (!fit.fit) {
      deal.status = 'walked_away';
      deal.walkReason = 'not_a_fit';
      deal.fitReasons = fit.reasons;
      deal.budgetLeft = (await campaign.note(deal.dealId, deal.creatorSlug, 'walked_away')).budgetLeft;
      this.save(deal);
      return this.must();
    }

    // Negotiate in the background so the transcript fills in turn by turn (poll GET /deals/:id).
    const run = negotiate(this.env, args, brand, creator, now, { onTurn: (t) => this.insertTurn(t) })
      .then((result) => this.finalize(result))
      .catch((err) => {
        console.error(`deal ${args.dealId}: negotiation failed: ${err instanceof Error ? err.message : String(err)}`);
        const d = this.must();
        d.status = 'walked_away';
        d.walkReason = `error: ${err instanceof Error ? err.message : String(err)}`;
        d.updatedAt = new Date().toISOString();
        this.save(d);
      });
    this.running = true;
    this.ctx.waitUntil(run.finally(() => { this.running = false; }));
    if (!this.env.OPENAI_API_KEY || this.env.LLM_MODE === 'off') await run; // engine mode is instant; keep the old synchronous contract
    return this.must();
  }

  /** negotiating -> agreed (budget reserved) | walked_away. */
  private async finalize(result: NegotiationResult): Promise<void> {
    const deal = this.must();
    const campaign = this.campaign(deal.campaignId);
    if (result.outcome === 'agreed' && result.acceptedOffer) {
      const price = result.acceptedOffer.package.cash_usd;
      deal.acceptedOffer = result.acceptedOffer;
      const r = await campaign.reserve(deal.dealId, deal.creatorSlug, price);
      if (r.ok) {
        deal.status = 'agreed';
        deal.price = price;
        deal.budgetLeft = r.budgetLeft;
      } else {
        deal.status = 'walked_away';
        deal.walkReason = 'budget';
        deal.budgetLeft = (await campaign.note(deal.dealId, deal.creatorSlug, 'walked_away')).budgetLeft;
      }
    } else {
      deal.status = 'walked_away';
      const r = result as NegotiationResult & { walk_reason?: string; gap_usd?: number };
      deal.walkReason = r.walk_reason ?? 'negotiation';
      if (r.gap_usd) deal.gap_usd = r.gap_usd;
      deal.budgetLeft = (await campaign.note(deal.dealId, deal.creatorSlug, 'walked_away')).budgetLeft;
    }
    deal.updatedAt = new Date().toISOString();
    this.save(deal);
  }

  // ---- reads -----------------------------------------------------------------------------------

  get(): DealWithTurns {
    const deal = this.recover(this.must());
    return { ...deal, turns: this.turns() };
  }

  transcript(): { dealId: string; turns: Turn[] } {
    const deal = this.recover(this.must());
    return { dealId: deal.dealId, turns: this.turns() };
  }

  // ---- market layer ----------------------------------------------------------------------------

  /** Written by POST /market/match. */
  setSelection(selection: Deal['selection'], ranks: Deal['ranks']): DealRecord {
    const deal = this.must();
    deal.selection = selection;
    deal.ranks = ranks;
    this.save(deal);
    return deal;
  }

  /** Everything the scorers need that lives in this DO: the deal and the creator profile it was
   *  negotiated with (bundled, or the onboarded/derived one persisted at create time). */
  scoreInputs(): { deal: DealRecord; brandSlug: string; creatorSlug: string; creatorProfile: CreatorProfile } {
    const deal = this.recover(this.must());
    const creatorProfile = CREATORS[deal.creatorSlug] ?? deal.creatorProfile;
    if (!creatorProfile) fail(500, `deal ${deal.dealId}: no creator profile stored for ${deal.creatorSlug} (created before the market layer?)`);
    return { deal, brandSlug: deal.brandSlug, creatorSlug: deal.creatorSlug, creatorProfile };
  }

  /** A human accepts the agreed terms for their side. Payment unlocks when both have. */
  approve(side: 'brand' | 'creator'): DealRecord {
    const deal = this.must();
    this.require(deal, 'agreed');
    deal.approvals = { brand: false, creator: false, ...deal.approvals, [side]: true };
    this.save(deal);
    return deal;
  }

  // ---- money -----------------------------------------------------------------------------------

  /** agreed -> held. Creates the creator's Connect account (once) and charges the brand. */
  async fund(): Promise<DealRecord> {
    const current = this.must();
    this.require(current, 'agreed');
    if (current.selection === 'not_selected') {
      fail(409, `deal ${current.dealId} was not selected by the market match (brand rank ${current.ranks?.brand ?? '?'}, creator rank ${current.ranks?.creator ?? '?'}). Re-run POST /market/match or fund a selected deal`);
    }
    if (current.approvals && !(current.approvals.brand && current.approvals.creator)) {
      fail(409, `deal ${current.dealId}: both sides must accept before payment (brand ${current.approvals.brand ? 'accepted' : 'pending'}, creator ${current.approvals.creator ? 'accepted' : 'pending'})`);
    }
    if (!(current.price >= 0.5)) {
      fail(422, `deal ${current.dealId}: cash part is $${current.price}. Product-only deals have nothing to charge (Stripe minimum is $0.50)`);
    }
    this.stripe(); // 503 before we enter the block
    return this.guarded(async () => {
      const deal = this.must();
      this.require(deal, 'agreed');
      const stripe = this.stripe();
      const creatorName = CREATORS[deal.creatorSlug]?.public.name ?? deal.creatorSlug;
      const accountId = await ensureCreatorAccount(stripe, {
        slug: deal.creatorSlug,
        name: creatorName,
        email: `${deal.creatorSlug}@example.com`,
      });
      // Never charge the brand for a creator we cannot pay out to.
      const transfers = await creatorTransfersStatus(stripe, accountId);
      if (transfers !== 'active') {
        fail(409, `deal ${deal.dealId}: creator account ${accountId} cannot receive transfers yet (stripe_transfers=${transfers}). The brand was not charged.`);
      }
      const { paymentIntentId, chargeId } = await chargeBrand(stripe, {
        dealId: deal.dealId,
        amountUsd: deal.price,
        description: `Creator deal ${deal.dealId}: ${deal.brandSlug} x ${deal.creatorSlug}`,
      });
      deal.stripe = { ...deal.stripe, accountId, paymentIntentId, chargeId };
      deal.status = 'held';
      // Deadline: if the post is not verified in time, alarm() refunds the brand.
      const holdMs = (Number(this.env.HOLD_DEADLINE_SECONDS) || 7 * 86_400) * 1000;
      deal.holdUntil = new Date(Date.now() + holdMs).toISOString();
      await this.ctx.storage.setAlarm(Date.now() + holdMs);
      deal.updatedAt = new Date().toISOString();
      this.save(deal);
      await this.ledger(deal, (c) => c.note(deal.dealId, deal.creatorSlug, 'held'));
      return deal;
    });
  }

  /** held -> paid_out when the post checks out; otherwise stays held and reports why. */
  async verify(args: { url: string; mock?: boolean }): Promise<VerifyOutcome> {
    const before = this.must();
    this.require(before, 'held');
    const brand = BRANDS[before.brandSlug];
    // Mock verification releases real (test) money, so only the server can turn it on.
    const mockAllowed = this.env.VERIFY_MODE === 'mock';
    if (args.mock === true && !mockAllowed) fail(403, 'mock verify is off. Set VERIFY_MODE=mock in server/.dev.vars for local demos');
    const useMock = mockAllowed && args.mock !== false;
    const result = useMock
      ? mockVerify(args.url)
      : await verifyPostLive({ url: args.url, requiredTag: brand ? brandHandle(brand) : undefined });

    if (!result.verified) {
      before.postUrl = args.url;
      before.updatedAt = new Date().toISOString();
      this.save(before);
      return { verified: false, deal: before, verify: result };
    }

    return this.guarded(async () => {
      const deal = this.must();
      this.require(deal, 'held'); // re-check: a concurrent expire may have won
      const stripe = this.stripe();
      const accountId = deal.stripe?.accountId;
      const chargeId = deal.stripe?.chargeId;
      if (!accountId || !chargeId) fail(500, `deal ${deal.dealId}: held without stripe accountId/chargeId`);
      const feePct = Number(this.env.PLATFORM_FEE_PCT || '10');
      const { transferId } = await payoutCreator(stripe, {
        dealId: deal.dealId, accountId, amountUsd: deal.price, feePct, chargeId,
      });
      // Money moved: persist the status first, ledger second (ledger is bookkeeping, not truth).
      deal.stripe = { ...deal.stripe, transferId };
      deal.postUrl = args.url;
      deal.status = 'paid_out';
      await this.ctx.storage.deleteAlarm();
      deal.updatedAt = new Date().toISOString();
      this.save(deal);
      await this.ledger(deal, async (c) => { deal.budgetLeft = (await c.commit(deal.dealId)).budgetLeft; this.save(deal); });
      return { verified: true, deal, verify: result };
    });
  }

  /** held -> refunded. Brand gets the money back, budget returns to the campaign. */
  async expire(): Promise<DealRecord> {
    this.require(this.must(), 'held');
    this.stripe();
    return this.guarded(async () => {
      const deal = this.must();
      this.require(deal, 'held');
      const stripe = this.stripe();
      const paymentIntentId = deal.stripe?.paymentIntentId;
      if (!paymentIntentId) fail(500, `deal ${deal.dealId}: held without stripe paymentIntentId`);
      const { refundId } = await refundBrand(stripe, { dealId: deal.dealId, paymentIntentId });
      deal.stripe = { ...deal.stripe, refundId };
      deal.status = 'refunded';
      await this.ctx.storage.deleteAlarm();
      deal.updatedAt = new Date().toISOString();
      this.save(deal);
      await this.ledger(deal, async (c) => { deal.budgetLeft = (await c.release(deal.dealId)).budgetLeft; this.save(deal); });
      return deal;
    });
  }

  /** Hold deadline passed without a verified post: refund the brand. */
  async alarm(): Promise<void> {
    const deal = this.load();
    if (deal?.status !== 'held') return;
    try {
      await this.expire();
      console.log(`deal ${deal.dealId}: hold deadline passed, brand refunded`);
    } catch (e) {
      console.error(`deal ${deal.dealId}: auto-refund failed: ${e instanceof Error ? e.message : String(e)}`);
      throw e; // let the runtime retry the alarm
    }
  }

  // ---- internals -------------------------------------------------------------------------------

  /** A DO restart (wrangler reload, eviction) drops the waitUntil promise; do not leave the deal
   *  in `negotiating` forever. */
  private recover(deal: DealRecord): DealRecord {
    if (deal.status === 'negotiating' && !this.running) {
      deal.status = 'walked_away';
      deal.walkReason = 'interrupted';
      deal.updatedAt = new Date().toISOString();
      this.save(deal);
    }
    return deal;
  }

  /** blockConcurrencyWhile resets the whole DO if the callback throws (and kills the background
   *  negotiation with it), so errors are carried out as values and rethrown outside the block. */
  private async guarded<T>(fn: () => Promise<T>): Promise<T> {
    const r = await this.ctx.blockConcurrencyWhile(async (): Promise<{ ok: T } | { err: unknown }> => {
      try { return { ok: await fn() }; } catch (err) { return { err }; }
    });
    if ('err' in r) throw r.err;
    return r.ok;
  }

  /** Ledger updates are best-effort after money has moved; a failure is logged, not fatal. */
  private async ledger(deal: DealRecord, fn: (c: ReturnType<DealDO['campaign']>) => Promise<unknown>): Promise<void> {
    try { await fn(this.campaign(deal.campaignId)); }
    catch (e) { console.error(`deal ${deal.dealId}: ledger update failed: ${e instanceof Error ? e.message : String(e)}`); }
  }

  // ---- internals -------------------------------------------------------------------------------

  private stripe() {
    const key = this.env.STRIPE_SECRET_KEY;
    if (!key) fail(503, 'stripe not configured');
    return makeStripe(key);
  }

  private campaign(campaignId: string) {
    return this.env.CAMPAIGN.get(this.env.CAMPAIGN.idFromName(campaignId));
  }

  private market() {
    return this.env.MARKET.get(this.env.MARKET.idFromName('market'));
  }

  private require(deal: DealRecord, status: DealStatus): void {
    if (deal.status !== status) fail(409, `deal ${deal.dealId} is ${deal.status}, expected ${status}`);
  }

  private load(): DealRecord | null {
    const row = this.sql.exec<{ json: string }>('SELECT json FROM deal WHERE id = 1').toArray()[0];
    return row ? (JSON.parse(row.json) as DealRecord) : null;
  }

  private must(): DealRecord {
    const deal = this.load();
    if (!deal) fail(404, 'deal not found');
    return deal;
  }

  private save(deal: DealRecord): void {
    deal.updatedAt = new Date().toISOString();
    this.sql.exec(
      `INSERT INTO deal (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
      JSON.stringify(deal),
    );
  }

  private insertTurn(t: Turn): void {
    const { ts, value_for_brand_usd, value_for_creator_usd, ...offer } = t;
    // House style: no em/en dashes in anything the UI shows, even if the model writes them.
    offer.message = offer.message.replace(/\s*[\u2014\u2013]\s*/g, ', ');
    this.sql.exec(
      `INSERT INTO messages (round, from_side, ts, offer_json, message, value_brand, value_creator, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      offer.round, offer.from, ts, JSON.stringify(offer), offer.message, value_for_brand_usd, value_for_creator_usd, offer.status,
    );
  }

  private turns(): Turn[] {
    return this.sql
      .exec<MessageRow>('SELECT * FROM messages ORDER BY seq')
      .toArray()
      .map((r) => ({
        ...(JSON.parse(r.offer_json) as Offer),
        ts: r.ts,
        value_for_brand_usd: r.value_brand,
        value_for_creator_usd: r.value_creator,
      }));
  }
}

/** "@marinelayer" from the brand's public name. verify.ts also matches the bare form. */
export function brandHandle(brand: BrandProfile): string {
  return '@' + brand.public.name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
