// Hand-rolled MCP Streamable HTTP endpoint (JSON-RPC 2.0 over POST /mcp, plain JSON, no SSE).
// Every tool drives the existing Hono routes through app.request(), so route logic stays in one place.
import type { Hono } from 'hono';
import type { Env } from './index';
import { BRANDS, CREATORS } from './profiles.bundle';

type McpEnv = Env & { MCP_TOKEN?: string };
type App = Hono<{ Bindings: Env }>;
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Turn = { round: number; from: string; status: string; message: string; package?: { cash_usd?: number } };
type Args = Record<string, unknown>;

const PROTOCOL = '2025-03-26';
const SERVER_INFO = { name: 'creator-deals', version: '1.0.0' };

const str = (a: Args, k: string): string => {
  const v = a[k];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${k} is required (string)`);
  return v.trim();
};
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const S = { id: (d: string) => ({ type: 'string', description: d }) };

export const TOOLS = [
  { name: 'list_brands', description: 'Brands with a bundled profile: slug, campaign name, budget total (public data only).', inputSchema: obj({}) },
  { name: 'list_creators', description: 'Creators with a bundled profile: slug, handle, platforms summary (public data only).', inputSchema: obj({}) },
  { name: 'create_campaign', description: 'Create a campaign for a brand: either a bundled brandSlug, or `brand`, a full onboarded brand profile object (public + private, same as REST POST /campaigns). budgetUsd defaults to the brand profile budget.', inputSchema: obj({ brandSlug: S.id('brand slug from list_brands (omit when passing brand)'), brand: { type: 'object', description: 'full brand profile object from onboarding, optional; overrides brandSlug' }, budgetUsd: { type: 'number', description: 'budget in USD, optional' } }) },
  { name: 'campaign_status', description: 'Campaign with budgetTotal, budgetLeft and its deals.', inputSchema: obj({ campaignId: S.id('campaign id') }, ['campaignId']) },
  { name: 'start_deal', description: 'Start a negotiation between the campaign brand and a creator. Returns the deal in status "negotiating"; two LLM agents negotiate in the background (4-7 turns, ~10 s each). Use wait_for_deal next.', inputSchema: obj({ campaignId: S.id('campaign id'), creatorSlug: S.id('creator slug from list_creators, or a slug for a scraped creator (handle without @)'), creator: { type: 'object', description: 'scraped Creator, optional: { handle, platform, followers, avgViews30d, engagement, fairPrice }', properties: { handle: { type: 'string' }, platform: { type: 'string' }, followers: { type: 'number' }, avgViews30d: { type: 'number' }, engagement: { type: 'number' }, fairPrice: { type: 'number' } }, required: ['handle', 'fairPrice'] }, creatorProfile: { type: 'object', description: 'full onboarded creator profile object, optional' } }, ['campaignId', 'creatorSlug']) },
  { name: 'get_deal', description: 'Deal with its transcript turns (messages, package, values for each side).', inputSchema: obj({ dealId: S.id('deal id') }, ['dealId']) },
  { name: 'wait_for_deal', description: 'Poll the deal every 3 s until the negotiation finishes (status != negotiating) or timeoutSec passes (default 45, keep it under 60 so the MCP client does not time out). If the result has timedOut: true, call this tool again with the same dealId until it finishes. Returns the final deal plus a one-line-per-turn transcript summary.', inputSchema: obj({ dealId: S.id('deal id'), timeoutSec: { type: 'number', description: 'max seconds to wait per call, default 45, max 240' } }, ['dealId']) },
  { name: 'fund_deal', description: 'Brand pays an agreed deal (Stripe test mode). agreed -> held.', inputSchema: obj({ dealId: S.id('deal id') }, ['dealId']) },
  { name: 'verify_post', description: 'Verify the creator post is live and pay out. held -> paid_out on success; on failure the deal stays held and verified=false.', inputSchema: obj({ dealId: S.id('deal id'), url: { type: 'string', description: 'post URL (http/https)' }, mock: { type: 'boolean', description: 'true skips the network check and passes' } }, ['dealId', 'url']) },
  { name: 'expire_deal', description: 'Refund a held deal, budget returns to the campaign. held -> refunded.', inputSchema: obj({ dealId: S.id('deal id') }, ['dealId']) },
  { name: 'evaluate_campaign', description: 'Brand view: the campaign\'s agreed deals ranked best first by brand surplus (value minus cash), with implied CPM and the package. Never shows creator-side numbers.', inputSchema: obj({ campaignId: S.id('campaign id') }, ['campaignId']) },
  { name: 'evaluate_creator', description: 'Creator view: every agreed deal for this creator across all campaigns, ranked best first by creator surplus. Never shows brand-side caps.', inputSchema: obj({ creatorSlug: S.id('creator slug') }, ['creatorSlug']) },
  { name: 'match_market', description: 'Run the market match over several campaigns: ranks every agreed deal for both sides, picks which go through (budget, headcount per brand, creator slots), and marks each deal selected / not_selected. fund_deal then refuses not_selected deals (409).', inputSchema: obj({ campaignIds: { type: 'array', items: { type: 'string' }, description: 'campaign ids to match together' }, headcount: { type: 'number', description: 'max creators per brand, default 3' } }, ['campaignIds']) },
  { name: 'finalize_campaign', description: 'Brand\'s agent picks the winners among the campaign\'s agreed deals (market match with headcount) and pays them automatically in Stripe test mode: a winner is paid now (status held) if the creator already accepted, otherwise the moment the creator accepts. Deals not picked walk away as not_selected and their budget is released. Safe to call again: returns the same winners and never pays twice.', inputSchema: obj({ campaignId: S.id('campaign id'), headcount: { type: 'number', description: 'how many creators to pick, default 1' } }, ['campaignId']) },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mountMcp(app: App) {
  const call = async (env: Env, method: string, path: string, body?: unknown, okStatuses: number[] = []) => {
    const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await app.request(path, init, env);
    const json = (await res.json()) as Record<string, unknown>;
    if (!res.ok && !okStatuses.includes(res.status)) throw new Error(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`);
    return json;
  };

  const run = async (env: Env, name: string, a: Args): Promise<unknown> => {
    switch (name) {
      case 'list_brands':
        return Object.entries(BRANDS).map(([slug, b]) => ({ slug, name: b.public.name, category: b.public.category, campaign: b.public.campaign.name, goal: b.public.campaign.goal, budgetTotal: b.private.budget_total_usd, wantedDeliverables: b.public.campaign.wanted_deliverables }));
      case 'list_creators':
        return Object.entries(CREATORS).map(([slug, c]) => ({ slug, name: c.public.name, handle: c.public.handle, niche: c.public.niche, platforms: c.public.platforms.map((p) => `${p.name}: ${p.followers} followers, ${p.avg_views} avg views, ${p.engagement_pct}% eng`), rateCard: c.public.rate_card }));
      case 'create_campaign':
        // Validation of `brand` lives in the REST route (brandFromBody in index.ts).
        return call(env, 'POST', '/campaigns', { ...(a.brand !== undefined ? { brand: a.brand } : { brandSlug: str(a, 'brandSlug') }), ...(a.budgetUsd !== undefined ? { budgetUsd: a.budgetUsd } : {}) });
      case 'campaign_status':
        return call(env, 'GET', `/campaigns/${encodeURIComponent(str(a, 'campaignId'))}`);
      case 'start_deal':
        // `creator` / `creatorProfile` are validated by the REST route (POST /deals in index.ts).
        return call(env, 'POST', '/deals', { campaignId: str(a, 'campaignId'), creatorSlug: str(a, 'creatorSlug'), ...(a.creator !== undefined ? { creator: a.creator } : {}), ...(a.creatorProfile !== undefined ? { creatorProfile: a.creatorProfile } : {}) });
      case 'get_deal':
        return call(env, 'GET', `/deals/${encodeURIComponent(str(a, 'dealId'))}`);
      case 'wait_for_deal': {
        const id = encodeURIComponent(str(a, 'dealId'));
        const timeout = Math.min(Math.max(Number(a.timeoutSec ?? 45) || 45, 1), 240) * 1000;
        const started = Date.now();
        let deal = await call(env, 'GET', `/deals/${id}`);
        while (deal.status === 'negotiating' && Date.now() - started < timeout) {
          await sleep(3000);
          deal = await call(env, 'GET', `/deals/${id}`);
        }
        const turns = (deal.turns as Turn[] | undefined) ?? [];
        const { turns: _t, ...rest } = deal;
        return {
          ...rest,
          timedOut: deal.status === 'negotiating',
          turnCount: turns.length,
          transcript: turns.map((t) => `r${t.round} ${t.from}: cash $${t.package?.cash_usd ?? '?'} [${t.status}] ${t.message}`),
        };
      }
      case 'fund_deal':
        return call(env, 'POST', `/deals/${encodeURIComponent(str(a, 'dealId'))}/fund`);
      case 'verify_post': {
        const out = await call(env, 'POST', `/deals/${encodeURIComponent(str(a, 'dealId'))}/verify`, { url: str(a, 'url'), ...(a.mock !== undefined ? { mock: Boolean(a.mock) } : {}) }, [422]);
        return { verified: out.status === 'paid_out', ...out };
      }
      case 'expire_deal':
        return call(env, 'POST', `/deals/${encodeURIComponent(str(a, 'dealId'))}/expire`);
      case 'evaluate_campaign':
        return call(env, 'GET', `/campaigns/${encodeURIComponent(str(a, 'campaignId'))}/evaluation`);
      case 'evaluate_creator':
        return call(env, 'GET', `/creators/${encodeURIComponent(str(a, 'creatorSlug'))}/evaluation`);
      case 'match_market': {
        const ids = Array.isArray(a.campaignIds) ? a.campaignIds.filter((x): x is string => typeof x === 'string') : [];
        if (ids.length === 0) throw new Error('campaignIds is required (string[])');
        return call(env, 'POST', '/market/match', { campaignIds: ids, ...(a.headcount !== undefined ? { headcount: Number(a.headcount) } : {}) });
      }
      case 'finalize_campaign':
        return call(env, 'POST', `/campaigns/${encodeURIComponent(str(a, 'campaignId'))}/finalize`, a.headcount !== undefined ? { headcount: Number(a.headcount) } : {});
      default:
        throw new Error(`unknown tool ${name}`);
    }
  };

  const rpcError = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  app.get('/mcp', (c) => c.json({ error: 'MCP endpoint: send JSON-RPC 2.0 via POST /mcp (Streamable HTTP, JSON responses only, no SSE)', tools: TOOLS.map((t) => t.name) }, 405));

  app.post('/mcp', async (c) => {
    const env = c.env as McpEnv;
    if (env.MCP_TOKEN && c.req.header('authorization') !== `Bearer ${env.MCP_TOKEN}`) {
      return c.json(rpcError(null, -32001, 'unauthorized: Authorization: Bearer <MCP_TOKEN> required'), 401);
    }
    let msg: Rpc;
    try {
      msg = (await c.req.json()) as Rpc;
    } catch {
      return c.json(rpcError(null, -32700, 'parse error: body must be a JSON-RPC 2.0 object'), 400);
    }
    if (Array.isArray(msg)) return c.json(rpcError(null, -32600, 'batch requests are not supported'), 400);
    if (!msg || typeof msg.method !== 'string') return c.json(rpcError(msg?.id, -32600, 'invalid request: method is required'), 400);
    const isNotification = msg.id === undefined || msg.id === null;
    if (msg.method.startsWith('notifications/')) return c.body(null, 202);
    const params = msg.params ?? {};
    const reply = (result: unknown) => c.json({ jsonrpc: '2.0', id: msg.id ?? null, result });

    switch (msg.method) {
      case 'initialize':
        return reply({ protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: 'Brand-deal manager tools. Flow: create_campaign -> start_deal -> wait_for_deal -> fund_deal -> verify_post.' });
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: TOOLS });
      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : '';
        if (!TOOLS.some((t) => t.name === name)) return c.json(rpcError(msg.id, -32602, `unknown tool ${name}`));
        const args = (params.arguments && typeof params.arguments === 'object' ? params.arguments : {}) as Args;
        try {
          const result = await run(c.env, name, args);
          return reply({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
        } catch (e) {
          return reply({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
        }
      }
      default:
        if (isNotification) return c.body(null, 202);
        return c.json(rpcError(msg.id, -32601, `method not found: ${msg.method}`));
    }
  });
}
