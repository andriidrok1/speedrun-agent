// Market match as a function (used by POST /market/match, the auto-trigger and scripts) plus the
// auto-trigger itself: once every negotiation in a campaign has finished, select and tell the agents.
import type { Env } from '../index';
import type { DealDO } from '../deal.do';
import type { MarketDealRow } from '../market.do';
import { BRANDS } from '../profiles.bundle';
import type { BrandProfile, BrandScore, CreatorProfile, CreatorScore, MarketInput } from '../types';
import { brandForCreator } from '../pricing';
import { scoreForBrand, scoreForCreator, rankBrand, rankCreator } from './score';
import { matchMarket } from './match';

export const campaignStub = (env: Env, id: string) => env.CAMPAIGN.get(env.CAMPAIGN.idFromName(id));
export const dealStub = (env: Env, id: string) => env.DEAL.get(env.DEAL.idFromName(id));
export const marketStub = (env: Env) => env.MARKET.get(env.MARKET.idFromName('market'));

export type Scored = {
  row: MarketDealRow;
  deal: Awaited<ReturnType<DealDO['scoreInputs']>>['deal'];
  brand: BrandScore;
  creator: CreatorScore;
};

/** Brand profile the deal was negotiated under: bundled or onboarded, capped to this creator. */
export async function brandProfileFor(env: Env, campaignId: string, brandSlug: string, creator: CreatorProfile): Promise<BrandProfile> {
  const base = BRANDS[brandSlug] ?? (await campaignStub(env, campaignId).brandProfile());
  if (!base) throw new Error(`[404] unknown brand ${brandSlug} for campaign ${campaignId}`);
  return brandForCreator(base, creator);
}

/** Loads + scores the given market rows, keeping only deals in `agreed` (the tentative ones). */
export async function scoreRows(env: Env, rows: MarketDealRow[]): Promise<Scored[]> {
  const now = new Date();
  const out = await Promise.all(rows.map(async (row): Promise<Scored | null> => {
    const inputs = await dealStub(env, row.dealId).scoreInputs();
    if (inputs.deal.status !== 'agreed') return null;
    const brand = await brandProfileFor(env, row.campaignId, row.brandSlug, inputs.creatorProfile);
    return {
      row, deal: inputs.deal,
      brand: scoreForBrand(inputs.deal, brand, inputs.creatorProfile, now),
      creator: scoreForCreator(inputs.deal, inputs.creatorProfile, brand, now),
    };
  }));
  return out.filter((s): s is Scored => s !== null);
}

export const brandView = (s: Scored, rank: number) => ({
  rank, dealId: s.deal.dealId, creatorSlug: s.deal.creatorSlug,
  cash_usd: s.brand.cash_usd, value_usd: s.brand.value_usd, surplus_usd: s.brand.surplus_usd,
  implied_cpm_usd: s.brand.implied_cpm_usd, package: s.deal.acceptedOffer?.package ?? null,
});
export const creatorView = (s: Scored, rank: number) => ({
  rank, dealId: s.deal.dealId, brandSlug: s.deal.brandSlug, campaignId: s.deal.campaignId,
  cash_usd: s.creator.cash_usd, value_usd: s.creator.value_usd, surplus_usd: s.creator.surplus_usd,
  package: s.deal.acceptedOffer?.package ?? null,
});
export const byDeal = (scored: Scored[]) => new Map(scored.map((s) => [s.deal.dealId, s]));

export type MatchResponse = {
  selected: string[];
  not_selected: string[];
  explain: Record<string, string>;
  brandRankings: Record<string, ReturnType<typeof brandView>[]>;
  creatorRankings: Record<string, ReturnType<typeof creatorView>[]>;
};

/** Ranks every agreed deal in the given campaigns from both sides, runs the match and writes
 *  selection/ranks to each DealDO. Same shape POST /market/match returns. */
export async function runMarketMatch(env: Env, campaignIds: string[], headcount: number): Promise<MatchResponse> {
  const campaigns = await Promise.all(campaignIds.map((id) => campaignStub(env, id).get()));
  const scored = await scoreRows(env, await marketStub(env).dealsForCampaigns(campaignIds));
  const lookup = byDeal(scored);

  const brandRankings: MatchResponse['brandRankings'] = {};
  const brandRank = new Map<string, number>();
  const brands: MarketInput['brands'] = campaigns.map((cv) => {
    const mine = scored.filter((s) => s.deal.campaignId === cv.campaignId);
    const ranked = rankBrand(mine.map((s) => s.brand));
    ranked.forEach((r, i) => brandRank.set(r.dealId, i + 1));
    brandRankings[cv.campaignId] = ranked.map((r, i) => brandView(lookup.get(r.dealId)!, i + 1));
    // Demo: the whole campaign budget is on the table, not just what is left after reservations.
    return { id: cv.campaignId, budget_usd: cv.budgetTotal, headcount, prefs: ranked.map((r) => r.dealId) };
  });

  const creatorRankings: MatchResponse['creatorRankings'] = {};
  const creatorRank = new Map<string, number>();
  const creatorSlugs = [...new Set(scored.map((s) => s.deal.creatorSlug))];
  const creators: MarketInput['creators'] = [];
  for (const slug of creatorSlugs) {
    const mine = scored.filter((s) => s.deal.creatorSlug === slug);
    const ranked = rankCreator(mine.map((s) => s.creator));
    ranked.forEach((r, i) => creatorRank.set(r.dealId, i + 1));
    creatorRankings[slug] = ranked.map((r, i) => creatorView(lookup.get(r.dealId)!, i + 1));
    const profile = (await dealStub(env, mine[0].deal.dealId).scoreInputs()).creatorProfile;
    creators.push({ id: slug, slots: profile.public.availability?.slots_per_month ?? 2, prefs: ranked.map((r) => r.dealId) });
  }

  const input: MarketInput = {
    brands, creators,
    deals: scored.map((s) => ({ id: s.deal.dealId, brandId: s.deal.campaignId, creatorId: s.deal.creatorSlug, cash_usd: s.brand.cash_usd })),
  };
  const result = matchMarket(input);
  const selectedSet = new Set(result.selected);
  await Promise.all(scored.map((s) => dealStub(env, s.deal.dealId).setSelection(
    selectedSet.has(s.deal.dealId) ? 'selected' : 'not_selected',
    { brand: brandRank.get(s.deal.dealId) ?? 0, creator: creatorRank.get(s.deal.dealId) ?? 0 },
  )));
  return {
    selected: result.selected,
    not_selected: scored.map((s) => s.deal.dealId).filter((id) => !selectedSet.has(id)),
    explain: result.explain,
    brandRankings,
    creatorRankings,
  };
}

// ---- auto-trigger --------------------------------------------------------------------------------

export type AutoMatchResult = { ran: boolean; reason: string; match?: MatchResponse };

/** Display names for the agent replies. */
async function namesFor(env: Env, dealId: string, campaignId: string, brandSlug: string, creatorSlug: string): Promise<{ brandName: string; creatorName: string }> {
  const brand = BRANDS[brandSlug] ?? (await campaignStub(env, campaignId).brandProfile());
  const creatorProfile = await dealStub(env, dealId).scoreInputs().then((i) => i.creatorProfile).catch(() => null);
  return { brandName: brand?.public.name ?? brandSlug, creatorName: creatorProfile?.public.name ?? creatorSlug };
}

/** Once every deal in the campaign has left `negotiating` and at least one agreed deal has no
 *  selection yet: match across every campaign the market knows, then let each deal's agents
 *  say the outcome in the chat (DealDO.applySelection). */
export async function autoMatchIfReady(env: Env, campaignId: string): Promise<AutoMatchResult> {
  const rows = await marketStub(env).dealsForCampaigns([campaignId]);
  if (rows.length === 0) return { ran: false, reason: 'nothing to select' };
  const deals = await Promise.all(rows.map((r) => dealStub(env, r.dealId).get()));
  if (deals.some((d) => d.status === 'negotiating')) return { ran: false, reason: 'still negotiating' };
  if (!deals.some((d) => d.status === 'agreed' && (d.selection === undefined || d.selection === null))) {
    return { ran: false, reason: 'nothing to select' };
  }
  const allCampaignIds = [...new Set((await marketStub(env).all()).map((r) => r.campaignId))];
  if (!allCampaignIds.includes(campaignId)) allCampaignIds.push(campaignId);
  const headcount = 3; // CampaignDO stores no headcount yet
  const match = await runMarketMatch(env, allCampaignIds, headcount);

  const touched = [...match.selected, ...match.not_selected];
  await Promise.all(touched.map(async (dealId) => {
    const stub = dealStub(env, dealId);
    const d = await stub.get();
    const brandRankings = match.brandRankings[d.campaignId] ?? [];
    const creatorRankings = match.creatorRankings[d.creatorSlug] ?? [];
    const ranks = {
      brand: brandRankings.find((b) => b.dealId === dealId)?.rank ?? d.ranks?.brand ?? 0,
      creator: creatorRankings.find((c) => c.dealId === dealId)?.rank ?? d.ranks?.creator ?? 0,
    };
    const names = await namesFor(env, dealId, d.campaignId, d.brandSlug, d.creatorSlug);
    await stub.applySelection({
      selection: match.selected.includes(dealId) ? 'selected' : 'not_selected',
      ranks,
      explain: match.explain[dealId] ?? '',
      ...names,
    });
  }));
  return { ran: true, reason: `matched ${allCampaignIds.length} campaign(s): ${match.selected.length} selected, ${match.not_selected.length} not selected`, match };
}

const lastAutoRun = new Map<string, number>();
const AUTO_MATCH_MIN_INTERVAL_MS = 5_000;

/** Lazy trigger from polled routes. Throttled per campaign; never throws. */
export async function autoMatchLazy(env: Env, campaignId: string): Promise<void> {
  const now = Date.now();
  const last = lastAutoRun.get(campaignId) ?? 0;
  if (now - last < AUTO_MATCH_MIN_INTERVAL_MS) return;
  lastAutoRun.set(campaignId, now);
  try {
    const r = await autoMatchIfReady(env, campaignId);
    if (r.ran) console.log(`[auto-match] campaign ${campaignId}: ${r.reason}`);
  } catch (e) {
    console.error(`[auto-match] campaign ${campaignId} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
