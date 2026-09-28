import type { Creator, Offer } from "@shared/contract";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";

// The same rules Andrii's server enforces (docs/plans/web-step-2-deal-page.md)
export interface DealRules {
  fair: number;
  floor: number; // creator never goes below
  ceiling: number; // brand never goes above
  brandOpen: number;
  creatorOpen: number;
}

const money = (x: number) => (x < 200 ? Math.round(x) : Math.round(x / 10) * 10);

export function rulesFor(c: Creator): DealRules {
  const fair = c.fairPrice;
  return {
    fair,
    floor: money(fair * 0.9),
    ceiling: money(fair * 1.3),
    brandOpen: money(fair * 0.8),
    creatorOpen: money(fair * 1.2),
  };
}

const BRAND_MOVES = [
  (a: number) => `We can move to ${fmtUsd(a)}. That is where our budget sits for this reach.`,
  (a: number) => `Final stretch from our side: ${fmtUsd(a)}.`,
  (a: number) => `${fmtUsd(a)} is the most we can do for this one.`,
];
const CREATOR_MOVES = [
  (a: number) => `I can meet you partway at ${fmtUsd(a)}.`,
  (a: number) => `${fmtUsd(a)} and I'll include the link in bio for 48 hours.`,
  (a: number) => `Last move from me: ${fmtUsd(a)}.`,
];

// Scripted negotiation: both sides converge, the last offer is the agreed price.
export function negotiate(c: Creator, dealId: string): Offer[] {
  const r = rulesFor(c);
  const name = (c.name ?? c.handle).split(/[|,]/)[0].trim();
  const aboveAvg = c.engagement >= 0.04;
  const offers: Offer[] = [];
  const gap = (a: number, b: number) => Math.abs(a - b) / r.fair;

  let brand = r.brandOpen;
  let creator = r.creatorOpen;
  offers.push({
    dealId,
    from: "brand",
    amount: brand,
    message: `Hi ${name}. We'd like 1 reel and 1 story. Your reels average ${fmtCompact(c.avgViews30d)} views over the last 30 days, so we're opening at ${fmtUsd(brand)}.`,
  });
  offers.push({
    dealId,
    from: "creator",
    amount: creator,
    message: `Thanks. On that reach my fair price is ${fmtUsd(r.fair)}, and my ${fmtPct(c.engagement)} engagement is ${aboveAvg ? "above" : "close to"} average. I can do it for ${fmtUsd(creator)}.`,
  });

  for (let round = 0; round < 3; round++) {
    brand = Math.min(r.ceiling, money(brand + (creator - brand) * 0.5));
    if (gap(brand, creator) < 0.05) {
      offers.push({ dealId, from: "creator", amount: brand, message: `${fmtUsd(brand)} works for me. Deal.` });
      return offers;
    }
    offers.push({ dealId, from: "brand", amount: brand, message: BRAND_MOVES[round](brand) });

    creator = Math.max(r.floor, money(creator - (creator - brand) * 0.6));
    if (gap(brand, creator) < 0.05) {
      offers.push({ dealId, from: "brand", amount: creator, message: `Agreed at ${fmtUsd(creator)}. Sending the payment now.` });
      return offers;
    }
    offers.push({ dealId, from: "creator", amount: creator, message: CREATOR_MOVES[round](creator) });
  }

  const final = money((brand + creator) / 2);
  offers.push({ dealId, from: "brand", amount: final, message: `Let's split the difference at ${fmtUsd(final)}. Deal.` });
  return offers;
}
