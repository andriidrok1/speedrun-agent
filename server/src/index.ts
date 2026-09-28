import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import { DealDO } from './deal.do';
import { CampaignDO, errMessage, errStatus } from './campaign.do';
import { BRANDS } from './profiles.bundle';
import type { Creator } from './types';
export { DealDO } from './deal.do';
export { CampaignDO } from './campaign.do';

export type Env = {
  DEAL: DurableObjectNamespace<DealDO>;
  CAMPAIGN: DurableObjectNamespace<CampaignDO>;
  STRIPE_SECRET_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  /** 'off' forces the deterministic engine even when OPENAI_API_KEY is set. */
  LLM_MODE?: string;
  PLATFORM_FEE_PCT: string;
  /** "mock" makes POST /deals/:id/verify skip the network check. */
  VERIFY_MODE?: string;
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
const campaignStub = (c: C, id: string) => c.env.CAMPAIGN.get(c.env.CAMPAIGN.idFromName(id));
const dealStub = (c: C, id: string) => c.env.DEAL.get(c.env.DEAL.idFromName(id));

app.onError((e, c) => {
  const status = errStatus(e);
  if (status >= 500) console.error('[api]', e);
  return c.json({ error: errMessage(e) }, status as 400);
});
app.notFound((c) => c.json({ error: `no route ${c.req.method} ${c.req.path}` }, 404));

// ---- campaigns -----------------------------------------------------------------------------------

app.post('/campaigns', async (c) => {
  const b = await body(c);
  const brandSlug = str(b, 'brandSlug');
  const brand = BRANDS[brandSlug];
  if (!brand) return c.json({ error: `unknown brand ${brandSlug}` }, 404);
  let budgetTotal = brand.private.budget_total_usd;
  if (b.budgetUsd !== undefined) {
    if (typeof b.budgetUsd !== 'number' || !(b.budgetUsd > 0)) return c.json({ error: 'budgetUsd must be a positive number' }, 400);
    budgetTotal = b.budgetUsd;
  }
  const campaignId = crypto.randomUUID();
  const view = await campaignStub(c, campaignId).init({ campaignId, brandSlug, budgetTotal });
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
  const campaign = await campaignStub(c, campaignId).get();
  const dealId = crypto.randomUUID();
  const deal = await dealStub(c, dealId).create({ dealId, campaignId, brandSlug: campaign.brandSlug, creatorSlug, creator });
  return c.json(deal, 201);
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

// ---- admin ---------------------------------------------------------------------------------------

app.post('/admin/reset', async (c) => {
  const b = await body(c);
  const campaignId = str(b, 'campaignId');
  await campaignStub(c, campaignId).reset();
  return c.json({ ok: true, campaignId });
});

export default app;
