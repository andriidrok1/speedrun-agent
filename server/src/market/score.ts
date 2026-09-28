// Market scoring: one number per side per agreed deal, plus rankings. Pure. No I/O.
import type { BrandProfile, BrandScore, CreatorProfile, CreatorScore, Deal } from '../types';
import { brandCap, cents, creatorRequired, valueForBrand, valueForCreator } from '../engine/valuation';

function acceptedOf(deal: Deal) {
  const offer = deal.acceptedOffer;
  if (!offer) throw new Error(`score: deal "${deal.dealId}" has no acceptedOffer`);
  return offer;
}

/** avg_views of the creator's first listed platform; null when missing or 0. */
export function primaryAvgViews(creator: CreatorProfile): number | null {
  const v = creator.public.platforms[0]?.avg_views;
  return typeof v === 'number' && v > 0 ? v : null;
}

export function scoreForBrand(deal: Deal, brand: BrandProfile, creator: CreatorProfile, now: Date = new Date()): BrandScore {
  void now; // brand-side valuation is time-independent today; kept for signature symmetry
  const offer = acceptedOf(deal);
  const pkg = offer.package;
  const value_usd = cents(valueForBrand(pkg, brand));
  const cap_usd = cents(brandCap(brand));
  const cash_usd = cents(pkg.cash_usd);
  const views = primaryAvgViews(creator);
  const implied_cpm_usd = views === null ? null : cents(cash_usd / (views / 1000));
  return { dealId: deal.dealId, surplus_usd: cents(cap_usd - value_usd), value_usd, cap_usd, cash_usd, implied_cpm_usd };
}

export function scoreForCreator(deal: Deal, creator: CreatorProfile, brand: BrandProfile, now: Date = new Date()): CreatorScore {
  void brand; // creator-side valuation only needs her own private rules
  const offer = acceptedOf(deal);
  const pkg = offer.package;
  const value_usd = cents(valueForCreator(pkg, offer, creator));
  const required_usd = cents(creatorRequired(offer, creator, now));
  return { dealId: deal.dealId, surplus_usd: cents(value_usd - required_usd), value_usd, required_usd, cash_usd: cents(pkg.cash_usd) };
}

/** Best first: surplus desc, then implied CPM asc (null last), then dealId for determinism. */
export function rankBrand(scores: BrandScore[]): BrandScore[] {
  return [...scores].sort((a, b) => {
    if (b.surplus_usd !== a.surplus_usd) return b.surplus_usd - a.surplus_usd;
    if (a.implied_cpm_usd === null && b.implied_cpm_usd === null) return a.dealId.localeCompare(b.dealId);
    if (a.implied_cpm_usd === null) return 1;
    if (b.implied_cpm_usd === null) return -1;
    if (a.implied_cpm_usd !== b.implied_cpm_usd) return a.implied_cpm_usd - b.implied_cpm_usd;
    return a.dealId.localeCompare(b.dealId);
  });
}

/** Best first: surplus desc, then cash desc, then dealId for determinism. */
export function rankCreator(scores: CreatorScore[]): CreatorScore[] {
  return [...scores].sort((a, b) => {
    if (b.surplus_usd !== a.surplus_usd) return b.surplus_usd - a.surplus_usd;
    if (b.cash_usd !== a.cash_usd) return b.cash_usd - a.cash_usd;
    return a.dealId.localeCompare(b.dealId);
  });
}
