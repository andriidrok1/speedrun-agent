// Deterministic two-sided negotiation. Pure: no I/O, no randomness, no wall clock (caller passes `now`).
import type { BrandProfile, CreatorProfile, Offer, Turn } from '../types';
import { brandCap, valueForBrand, valueForCreator } from './valuation';
import { brandNextOffer, creatorNextOffer, creatorAtFloor, type NegotiationCtx } from './concession';
import { evaluate } from './rules';

export * from './valuation';
export * from './concession';
export * from './rules';

export type NegotiationInput = { brand: BrandProfile; creator: CreatorProfile; now: Date; maxRounds?: number };
export type NegotiationResult = {
  turns: Turn[];
  outcome: 'agreed' | 'walked_away';
  acceptedOffer?: Offer;
  rounds: number;
};

const HARD_ROUND_LIMIT = 50;

export function runNegotiation({ brand, creator, now, maxRounds }: NegotiationInput): NegotiationResult {
  const ctx: NegotiationCtx = { now };
  const limit = Math.min(
    brand.private.concession_rules.max_rounds,
    creator.private.concession_rules.max_rounds,
    maxRounds ?? HARD_ROUND_LIMIT,
    HARD_ROUND_LIMIT,
  );
  if (limit < 1) throw new Error(`runNegotiation: round limit must be >= 1, got ${limit}`);

  const turns: Turn[] = [];
  const push = (offer: Offer): Turn => {
    const turn: Turn = {
      ...offer,
      ts: new Date(now.getTime() + turns.length * 60_000).toISOString(),
      value_for_brand_usd: valueForBrand(offer.package, brand),
      value_for_creator_usd: valueForCreator(offer.package, offer, creator),
    };
    turns.push(turn);
    return turn;
  };
  const accept = (offer: Offer, from: Offer['from'], message: string): NegotiationResult => {
    push({ ...offer, from, message, status: 'accept' });
    return { turns, outcome: 'agreed', acceptedOffer: offer, rounds: offer.round };
  };
  const walk = (offer: Offer, from: Offer['from'], message: string): NegotiationResult => {
    push({ ...offer, from, message, status: 'walk_away' });
    return { turns, outcome: 'walked_away', rounds: offer.round };
  };

  let lastCreator: Offer | null = null;
  for (let round = 1; round <= limit; round++) {
    const brandOffer = push(brandNextOffer(round, lastCreator, brand, creator, ctx));
    if (evaluate(brandOffer, 'creator', brand, creator, ctx).accept) {
      return accept(brandOffer, 'creator', `Deal. Round ${round} works for me, send the brief and I'll get it on the calendar.`);
    }

    const creatorOffer = push(creatorNextOffer(round, brandOffer, creator, brand, ctx));
    if (evaluate(creatorOffer, 'brand', brand, creator, ctx).accept) {
      return accept(creatorOffer, 'brand', `Deal. We'll take round ${round} as proposed, contract and product shipment to follow.`);
    }

    if (creatorAtFloor(round, creator) && valueForBrand(creatorOffer.package, brand) > brandCap(brand)) {
      return walk(creatorOffer, 'brand', `We're too far apart on budget for this one, so we'll step back. Thanks for talking it through.`);
    }
    lastCreator = creatorOffer;
  }

  const last = turns[turns.length - 1];
  if (!last) throw new Error('runNegotiation: no turns produced');
  return walk(last, 'brand', `We've gone ${limit} rounds without landing it, so we'll pause here. Door stays open for a future drop.`);
}
