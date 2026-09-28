import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import { DealDO } from './deal.do';
import { CampaignDO, errMessage, errStatus } from './campaign.do';
import { MarketDO, type MarketDealRow } from './market.do';
import { BRANDS } from './profiles.bundle';
import type { BrandProfile, BrandScore, Creator, CreatorProfile, CreatorScore, MarketInput } from './types';
import { brandForCreator } from './pricing';
import { scoreForBrand, scoreForCreator, rankBrand, rankCreator } from './market/score';
import { matchMarket } from './market/match';
import Stripe from 'stripe';
import { makeStripe } from './stripe';
import { mountMcp } from './mcp';
import { mountBrainbase } from './brainbase';
import { onboard } from './onboard';
export { DealDO } from './deal.do';
export { CampaignDO } from './campaign.do';
export { MarketDO } from './market.do';

export type Env = {
  DEAL: DurableObjectNamespace<DealDO>;
  CAMPAIGN: DurableObjectNamespace<CampaignDO>;
  /** Singleton (name "market"): index of every deal by campaign / creator for the market layer. */
  MARKET: DurableObjectNamespace<MarketDO>;
  STRIPE_SECRET_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  /** 'off' forces the deterministic engine even when OPENAI_API_KEY is set. */
  LLM_MODE?: string;
  PLATFORM_FEE_PCT: string;
  /** "mock" lets POST /deals/:id/verify skip the network check. Off unless set. */
  VERIFY_MODE?: string;
  /** Seconds a held deal waits for a verified post before auto-refund. Default 7 days. */
  HOLD_DEADLINE_SECONDS?: string;
  /** Signing secret for POST /stripe/webhook (from `stripe listen` or the dashboard). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Brainbase PAT for /brainbase/* (src/brainbase.ts). */
  BRAINBASE_API_KEY?: string;
  /** Brand-manager agent id; defaults to brainbase/brainbase.agent.yaml. */
  BRAINBASE_AGENT_ID?: string;
};

type C = Context<{ Bindings: Env }>;
type Body = Record<string, unknown>;

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());

app.get('/health', (c) => c.json({ ok: true, service: 'creator-deals', ts: new Date().toISOString() }));

// ---- helpers -------------------------------------------------------------------------------------

async function body(c: C): Promise<Body> {
  const raw = await c.req.text();
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be a JSON object');
    return parsed as Body;
  } catch (e) {
    throw new Error(`[400] invalid JSON body: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const str = (b: Body, key: string): string => {
  const v = b[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`[400] ${key} is required (string)`);
  return v.trim();
};
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Shape check for an onboarded brand profile (context/SCHEMA.md). The engine reads these fields. */
function brandFromBody(v: unknown): BrandProfile {
  const p = v as BrandProfile;
  const ok = isObj(v) && isObj(p.public) && isObj(p.private) && typeof p.public.name === 'string' && p.public.name.trim()
    && isObj(p.public.campaign) && Array.isArray(p.public.campaign.wanted_deliverables) && p.public.campaign.wanted_deliverables.length > 0
    && isObj(p.public.barter_menu) && Array.isArray(p.public.barter_menu.product)
    && num(p.private.budget_total_usd) && num(p.private.budget_per_creator_max_usd)
    && isObj(p.private.valuation) && isObj(p.private.concession_rules);
  if (!ok) throw new Error('[400] brand must be a brand profile (public.name, public.campaign.wanted_deliverables, public.barter_menu, private budgets, valuation, concession_rules)');
  return p;
}

/** Shape check for an onboarded creator profile (context/SCHEMA.md). */
function creatorProfileFromBody(v: unknown): CreatorProfile {
  const p = v as CreatorProfile;
  const ok = isObj(v) && isObj(p.public) && isObj(p.private) && typeof p.public.name === 'string' && typeof p.public.handle === 'string'
    && isObj(p.public.rate_card) && isObj(p.public.barter_openness) && isObj(p.public.availability)
    && isObj(p.private.floor_usd) && num(p.private.floor_usd.reel) && num(p.private.floor_usd.story)
    && isObj(p.private.valuation) && isObj(p.private.premiums) && isObj(p.private.concession_rules);
  if (!ok) throw new Error('[400] creatorProfile must be a creator profile (public rate_card, barter_openness, availability; private floor_usd, valuation, premiums, concession_rules)');
  return p;
}

const campaignStub = (c: C, id: string) => c.env.CAMPAIGN.get(c.env.CAMPAIGN.idFromName(id));
const dealStub = (c: C, id: string) => c.env.DEAL.get(c.env.DEAL.idFromName(id));
const marketStub = (c: C) => c.env.MARKET.get(c.env.MARKET.idFromName('market'));

app.onError((e, c) => {
  const status = errStatus(e);
  if (status >= 500) console.error('[api]', e);
  return c.json({ error: errMessage(e) }, status as 400);
});
app.notFound((c) => c.json({ error: `no route ${c.req.method} ${c.req.path}` }, 404));

// ---- campaigns -----------------------------------------------------------------------------------

app.post('/campaigns', async (c) => {
  const b = await body(c);
  // Either a bundled brand by slug, or a full profile from brand onboarding.
  const custom = b.brand !== undefined ? brandFromBody(b.brand) : undefined;
  const brandSlug = custom ? `custom-${slugify(custom.public.name)}` : str(b, 'brandSlug');
  const brand = custom ?? BRANDS[brandSlug];
  if (!brand) return c.json({ error: `unknown brand ${brandSlug}` }, 404);
  let budgetTotal = brand.private.budget_total_usd;
  if (b.budgetUsd !== undefined) {
    if (typeof b.budgetUsd !== 'number' || !(b.budgetUsd > 0)) return c.json({ error: 'budgetUsd must be a positive number' }, 400);
    budgetTotal = b.budgetUsd;
  }
  const campaignId = crypto.randomUUID();
  const view = await campaignStub(c, campaignId).init({ campaignId, brandSlug, budgetTotal, brand: custom });
  return c.json({ campaignId: view.campaignId, brandSlug: view.brandSlug, budgetTotal: view.budgetTotal, budgetLeft: view.budgetLeft }, 201);
});

app.get('/campaigns/:id', async (c) => c.json(await campaignStub(c, c.req.param('id')).get()));

// ---- deals ---------------------------------------------------------------------------------------

app.post('/deals', async (c) => {
  const b = await body(c);
  const campaignId = str(b, 'campaignId');
  const creatorSlug = str(b, 'creatorSlug');
  let creator: Creator | undefined;
  if (b.creator !== undefined) {
    const cr = b.creator as Partial<Creator> | null;
    if (!cr || typeof cr !== 'object' || typeof cr.handle !== 'string' || typeof cr.fairPrice !== 'number') {
      return c.json({ error: 'creator must be a Creator object with at least handle and fairPrice' }, 400);
    }
    creator = {
      handle: cr.handle,
      platform: cr.platform ?? 'instagram',
      followers: Number(cr.followers ?? 0),
      avgViews30d: Number(cr.avgViews30d ?? 0),
      engagement: Number(cr.engagement ?? 0),
      fairPrice: cr.fairPrice,
    };
  }
  const creatorProfile = b.creatorProfile !== undefined ? creatorProfileFromBody(b.creatorProfile) : undefined;
  const campaign = await campaignStub(c, campaignId).get();
  const dealId = crypto.randomUUID();
  const requireApproval = b.requireApproval === true;
  const deal = await dealStub(c, dealId).create({ dealId, campaignId, brandSlug: campaign.brandSlug, creatorSlug, creator, creatorProfile, requireApproval });
  return c.json(deal, 201);
});

app.post('/deals/:id/approve', async (c) => {
  const b = await body(c);
  const side = str(b, 'side');
  if (side !== 'brand' && side !== 'creator') return c.json({ error: 'side must be "brand" or "creator"' }, 400);
  return c.json(await dealStub(c, c.req.param('id')).approve(side));
});

app.get('/deals/:id', async (c) => c.json(await dealStub(c, c.req.param('id')).get()));
app.get('/deals/:id/transcript', async (c) => c.json(await dealStub(c, c.req.param('id')).transcript()));

app.post('/deals/:id/fund', async (c) => c.json(await dealStub(c, c.req.param('id')).fund()));

app.post('/deals/:id/verify', async (c) => {
  const b = await body(c);
  const url = str(b, 'url');
  if (!/^https?:\/\//i.test(url)) return c.json({ error: 'url must start with http(s)://' }, 400);
  if (b.mock !== undefined && typeof b.mock !== 'boolean') return c.json({ error: 'mock must be a boolean' }, 400);
  const out = await dealStub(c, c.req.param('id')).verify({ url, mock: b.mock as boolean | undefined });
  return c.json({ ...out.deal, verify: out.verify }, out.verified ? 200 : 422);
});

app.post('/deals/:id/expire', async (c) => c.json(await dealStub(c, c.req.param('id')).expire()));

// ---- stripe webhook ------------------------------------------------------------------------------
// Signed events from Stripe. Deals move synchronously (charges are confirmed server-side), so this is
// the audit trail per deal: payments, refunds, transfers. Locally:
//   stripe listen --forward-to localhost:8787/stripe/webhook   (prints the whsec_ for .dev.vars)

app.post('/stripe/webhook', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  const key = c.env.STRIPE_SECRET_KEY;
  if (!secret || !key) return c.json({ error: 'stripe webhook not configured' }, 503);
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.json({ error: 'missing stripe-signature header' }, 400);
  const raw = await c.req.text(); // raw body: the signature is over the exact bytes
  let event: Stripe.Event;
  try {
    event = await makeStripe(key).webhooks.constructEventAsync(raw, sig, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return c.json({ error: 'invalid stripe signature' }, 400);
  }
  const obj = event.data.object as { id?: string; metadata?: Record<string, string> };
  console.log(`[stripe webhook] ${event.type} ${obj.id ?? ''} deal=${obj.metadata?.dealId ?? '-'}`);
  return c.json({ received: true });
});


// ---- market: evaluation + match ------------------------------------------------------------------
// Scores every agreed deal from both sides (server/src/market/*), ranks them per brand and per
// creator, and POST /market/match picks which tentative deals go through. Each view only exposes its
// own side's numbers: the brand never sees the creator's floor, the creator never sees the cap.

type Scored = {
  row: MarketDealRow;
  deal: Awaited<ReturnType<DealDO['scoreInputs']>>['deal'];
  brand: BrandScore;
  creator: CreatorScore;
};

/** Brand profile the deal was negotiated under: bundled or onboarded, capped to this creator. */
async function brandProfileFor(c: C, campaignId: string, brandSlug: string, creator: CreatorProfile): Promise<BrandProfile> {
  const base = BRANDS[brandSlug] ?? (await campaignStub(c, campaignId).brandProfile());
  if (!base) throw new Error(`[404] unknown brand ${brandSlug} for campaign ${campaignId}`);
  return brandForCreator(base, creator);
}

/** Loads + scores the given market rows, keeping only deals in `agreed` (the tentative ones). */
async function scoreRows(c: C, rows: MarketDealRow[]): Promise<Scored[]> {
  const now = new Date();
  const out = await Promise.all(rows.map(async (row): Promise<Scored | null> => {
    const inputs = await dealStub(c, row.dealId).scoreInputs();
    if (inputs.deal.status !== 'agreed') return null;
    const brand = await brandProfileFor(c, row.campaignId, row.brandSlug, inputs.creatorProfile);
    return {
      row, deal: inputs.deal,
      brand: scoreForBrand(inputs.deal, brand, inputs.creatorProfile, now),
      creator: scoreForCreator(inputs.deal, inputs.creatorProfile, brand, now),
    };
  }));
  return out.filter((s): s is Scored => s !== null);
}

const brandView = (s: Scored, rank: number) => ({
  rank, dealId: s.deal.dealId, creatorSlug: s.deal.creatorSlug,
  cash_usd: s.brand.cash_usd, value_usd: s.brand.value_usd, surplus_usd: s.brand.surplus_usd,
  implied_cpm_usd: s.brand.implied_cpm_usd, package: s.deal.acceptedOffer?.package ?? null,
});
const creatorView = (s: Scored, rank: number) => ({
  rank, dealId: s.deal.dealId, brandSlug: s.deal.brandSlug, campaignId: s.deal.campaignId,
  cash_usd: s.creator.cash_usd, value_usd: s.creator.value_usd, surplus_usd: s.creator.surplus_usd,
  package: s.deal.acceptedOffer?.package ?? null,
});
const byDeal = (scored: Scored[]) => new Map(scored.map((s) => [s.deal.dealId, s]));

app.get('/campaigns/:id/evaluation', async (c) => {
  const campaignId = c.req.param('id');
  const campaign = await campaignStub(c, campaignId).get();
  const scored = await scoreRows(c, await marketStub(c).dealsForCampaigns([campaignId]));
  const lookup = byDeal(scored);
  const ranked = rankBrand(scored.map((s) => s.brand)).map((b, i) => brandView(lookup.get(b.dealId)!, i + 1));
  return c.json({ campaignId, brandSlug: campaign.brandSlug, budgetLeft: campaign.budgetLeft, ranked });
});

// Brand messenger: every conversation in a campaign, newest activity first.
app.get('/campaigns/:id/deals', async (c) => {
  const rows = await marketStub(c).dealsForCampaigns([c.req.param('id')]);
  const deals = await Promise.all(
    rows.map(async (r) => {
      const d = await dealStub(c, r.dealId).get();
      const last = d.turns[d.turns.length - 1];
      return {
        dealId: d.dealId,
        creatorSlug: d.creatorSlug,
        status: d.status,
        price: d.price,
        walkReason: d.walkReason,
        fitReasons: d.fitReasons,
        gap_usd: d.gap_usd,
        approvals: d.approvals,
        turns: d.turns.length,
        lastFrom: last?.from,
        lastCash: last?.package.cash_usd,
        lastMessage: last?.message,
        updatedAt: d.updatedAt,
      };
    }),
  );
  deals.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return c.json({ campaignId: c.req.param('id'), deals });
});

// Creator inbox: every conversation this creator's agent is in, newest activity first.
app.get('/creators/:slug/deals', async (c) => {
  const rows = await marketStub(c).dealsForCreator(c.req.param('slug'));
  const names = new Map<string, string>();
  const brandName = async (campaignId: string, brandSlug: string) => {
    if (BRANDS[brandSlug]) return BRANDS[brandSlug].public.name;
    if (!names.has(campaignId)) names.set(campaignId, (await campaignStub(c, campaignId).brandProfile())?.public.name ?? brandSlug);
    return names.get(campaignId)!;
  };
  const deals = await Promise.all(
    rows.map(async (r) => {
      const d = await dealStub(c, r.dealId).get();
      const last = d.turns[d.turns.length - 1];
      return {
        dealId: d.dealId,
        campaignId: d.campaignId,
        brandSlug: d.brandSlug,
        brandName: await brandName(d.campaignId, d.brandSlug),
        status: d.status,
        price: d.price,
        walkReason: d.walkReason,
        gap_usd: d.gap_usd,
        approvals: d.approvals,
        turns: d.turns.length,
        lastFrom: last?.from,
        lastCash: last?.package.cash_usd,
        lastMessage: last?.message,
        updatedAt: d.updatedAt,
      };
    }),
  );
  deals.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return c.json({ creatorSlug: c.req.param('slug'), deals });
});

app.get('/creators/:slug/evaluation', async (c) => {
  const creatorSlug = c.req.param('slug');
  const scored = await scoreRows(c, await marketStub(c).dealsForCreator(creatorSlug));
  const lookup = byDeal(scored);
  const ranked = rankCreator(scored.map((s) => s.creator)).map((r, i) => creatorView(lookup.get(r.dealId)!, i + 1));
  return c.json({ creatorSlug, ranked });
});

app.post('/market/match', async (c) => {
  const b = await body(c);
  const campaignIds = Array.isArray(b.campaignIds) ? b.campaignIds.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
  if (campaignIds.length === 0) return c.json({ error: 'campaignIds must be a non-empty string array' }, 400);
  const headcount = b.headcount === undefined ? 3 : Number(b.headcount);
  if (!Number.isInteger(headcount) || headcount < 1) return c.json({ error: 'headcount must be a positive integer' }, 400);

  const campaigns = await Promise.all(campaignIds.map((id) => campaignStub(c, id).get()));
  const scored = await scoreRows(c, await marketStub(c).dealsForCampaigns(campaignIds));
  const lookup = byDeal(scored);

  // Per-brand and per-creator preference lists (dealIds, best first) from the two rankers.
  const brandRankings: Record<string, ReturnType<typeof brandView>[]> = {};
  const brandRank = new Map<string, number>();
  const brands: MarketInput['brands'] = campaigns.map((cv) => {
    const mine = scored.filter((s) => s.deal.campaignId === cv.campaignId);
    const ranked = rankBrand(mine.map((s) => s.brand));
    ranked.forEach((r, i) => brandRank.set(r.dealId, i + 1));
    brandRankings[cv.campaignId] = ranked.map((r, i) => brandView(lookup.get(r.dealId)!, i + 1));
    // Demo: the whole campaign budget is on the table, not just what is left after reservations.
    return { id: cv.campaignId, budget_usd: cv.budgetTotal, headcount, prefs: ranked.map((r) => r.dealId) };
  });

  const creatorRankings: Record<string, ReturnType<typeof creatorView>[]> = {};
  const creatorRank = new Map<string, number>();
  const creatorSlugs = [...new Set(scored.map((s) => s.deal.creatorSlug))];
  const creators: MarketInput['creators'] = [];
  for (const slug of creatorSlugs) {
    const mine = scored.filter((s) => s.deal.creatorSlug === slug);
    const ranked = rankCreator(mine.map((s) => s.creator));
    ranked.forEach((r, i) => creatorRank.set(r.dealId, i + 1));
    creatorRankings[slug] = ranked.map((r, i) => creatorView(lookup.get(r.dealId)!, i + 1));
    const profile = (await dealStub(c, mine[0].deal.dealId).scoreInputs()).creatorProfile;
    creators.push({ id: slug, slots: profile.public.availability?.slots_per_month ?? 2, prefs: ranked.map((r) => r.dealId) });
  }

  const input: MarketInput = {
    brands, creators,
    deals: scored.map((s) => ({ id: s.deal.dealId, brandId: s.deal.campaignId, creatorId: s.deal.creatorSlug, cash_usd: s.brand.cash_usd })),
  };
  const result = matchMarket(input);
  const selectedSet = new Set(result.selected);
  await Promise.all(scored.map((s) => dealStub(c, s.deal.dealId).setSelection(
    selectedSet.has(s.deal.dealId) ? 'selected' : 'not_selected',
    { brand: brandRank.get(s.deal.dealId) ?? 0, creator: creatorRank.get(s.deal.dealId) ?? 0 },
  )));
  return c.json({
    selected: result.selected,
    not_selected: scored.map((s) => s.deal.dealId).filter((id) => !selectedSet.has(id)),
    explain: result.explain,
    brandRankings,
    creatorRankings,
  });
});

// ---- onboarding ----------------------------------------------------------------------------------

// Free text (plus optional website / Instagram link) -> a filled BrandForm or CreatorForm (src/onboard.ts).
app.post('/onboard', async (c) => {
  const b = await body(c);
  const side = b.side;
  if (side !== 'brand' && side !== 'creator') return c.json({ error: 'side must be "brand" or "creator"' }, 400);
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text) return c.json({ error: 'text is required' }, 400);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: 'OPENAI_API_KEY is not set on the server' }, 503);
  return c.json(await onboard({
    apiKey: c.env.OPENAI_API_KEY,
    model: c.env.OPENAI_MODEL,
    side,
    text,
    url: typeof b.url === 'string' ? b.url : undefined,
    current: isObj(b.current) ? b.current : undefined,
  }));
});

// ---- admin ---------------------------------------------------------------------------------------

app.post('/admin/reset', async (c) => {
  const b = await body(c);
  const campaignId = str(b, 'campaignId');
  await campaignStub(c, campaignId).reset();
  return c.json({ ok: true, campaignId });
});

mountMcp(app); // MCP Streamable HTTP endpoint: POST /mcp (src/mcp.ts)
mountBrainbase(app); // Brainbase manager agent proxy: /brainbase/* (src/brainbase.ts)

export default app;
