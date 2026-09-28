// Rules: does `side` accept `offer`? Pure, deterministic. Reasons are for logs, not for the transcript.
import type { BrandProfile, CreatorProfile, Offer, Side } from '../types';
import { brandCap, creatorRequired, daysUntil, valueForBrand, valueForCreator } from './valuation';
import { brandWillingness, type NegotiationCtx } from './concession';

export type Verdict = { accept: boolean; reason: string };

const CREATOR_MAX_EXCLUSIVITY_DAYS = 60;
const CREATOR_MIN_DEADLINE_DAYS = 5;

export function evaluate(offer: Offer, side: Side, brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx): Verdict {
  if (side === 'creator') return creatorEvaluates(offer, brand, creator, ctx);
  if (side === 'brand') return brandEvaluates(offer, brand, creator, ctx);
  throw new Error(`evaluate: unknown side "${side as string}" (round ${offer.round})`);
}

function creatorEvaluates(offer: Offer, brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx): Verdict {
  const r = offer.round;
  if (creator.private.stop_brands.some((s) => s.toLowerCase() === brand.public.name.toLowerCase())) {
    return { accept: false, reason: `round ${r}: ${brand.public.name} is on the creator's stop list` };
  }
  if (offer.exclusivity.days > CREATOR_MAX_EXCLUSIVITY_DAYS) {
    return { accept: false, reason: `round ${r}: exclusivity ${offer.exclusivity.days}d exceeds creator's ${CREATOR_MAX_EXCLUSIVITY_DAYS}d dealbreaker` };
  }
  const days = daysUntil(offer.deadline, ctx.now);
  if (days < CREATOR_MIN_DEADLINE_DAYS) {
    return { accept: false, reason: `round ${r}: deadline ${offer.deadline} is ${days.toFixed(1)}d out, creator needs >= ${CREATOR_MIN_DEADLINE_DAYS}d` };
  }
  const slot = creator.public.availability.next_open_slot;
  if (slot && offer.deadline < slot) {
    return { accept: false, reason: `round ${r}: deadline ${offer.deadline} is before creator's next open slot ${slot}` };
  }
  if (offer.usage_rights === 'perpetual' && brand.public.no_gos.some((g) => /perpetual/i.test(g))) {
    return { accept: false, reason: `round ${r}: perpetual usage is off the table for ${brand.public.name}` };
  }
  const value = valueForCreator(offer.package, offer, creator);
  const required = creatorRequired(offer, creator, ctx.now);
  if (value < required) {
    return { accept: false, reason: `round ${r}: creator value ${value} < required ${required}` };
  }
  return { accept: true, reason: `round ${r}: creator value ${value} >= required ${required}` };
}

function brandEvaluates(offer: Offer, brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx): Verdict {
  void creator; void ctx;
  const r = offer.round;
  if (offer.usage_rights === 'perpetual') {
    return { accept: false, reason: `round ${r}: brand never grants/buys perpetual usage` };
  }
  const cap = brandCap(brand);
  const value = valueForBrand(offer.package, brand);
  if (value > cap) {
    return { accept: false, reason: `round ${r}: brand all-in ${value} > cap ${cap}` };
  }
  if (offer.package.affiliate_pct === 0 && offer.package.cash_usd > 4000) {
    return { accept: false, reason: `round ${r}: cash-only ${offer.package.cash_usd} above 4000 with no affiliate component` };
  }
  // The brand accepts what it would have offered next round anyway.
  const willing = brandWillingness(r + 1, brand);
  if (value > willing) {
    return { accept: false, reason: `round ${r}: brand all-in ${value} > willingness ${willing} for round ${r + 1}` };
  }
  return { accept: true, reason: `round ${r}: brand all-in ${value} <= willingness ${willing} (cap ${cap})` };
}
