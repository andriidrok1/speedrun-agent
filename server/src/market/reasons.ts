// Finalize reasons: one short human sentence per deal for POST /campaigns/:id/finalize. Pure. No I/O.
import type { CreatorProfile, Deliverable } from '../types';

export const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

export const usd = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const LABELS: Record<string, [string, string]> = {
  reel: ['reel', 'reels'], story: ['story', 'stories'], post: ['post', 'posts'],
  youtube_integration: ['YouTube integration', 'YouTube integrations'], tiktok: ['TikTok', 'TikToks'],
};

/** "1 reel + 3 stories". Empty string when there are no deliverables. */
export function packageLabel(deliverables: Deliverable[]): string {
  return deliverables
    .filter((d) => d.qty > 0)
    .map((d) => `${d.qty} ${(LABELS[d.type] ?? [d.type, d.type])[d.qty === 1 ? 0 : 1]}`)
    .join(' + ');
}

/** The creator's public rate card price for these deliverables (reel, story, post; the bundle rate
 *  for 1 reel + 3 stories). 0 when unknown. */
export function fairPrice(deliverables: Deliverable[], creator: CreatorProfile | undefined): number {
  const card = creator?.public.rate_card;
  if (!card) return 0;
  const qty = (t: string) => deliverables.filter((d) => d.type === t).reduce((n, d) => n + d.qty, 0);
  const bundle = qty('reel') === 1 && qty('story') === 3 && card.bundle_reel_3_stories > 0;
  let sum = bundle ? card.bundle_reel_3_stories : 0;
  for (const d of deliverables) {
    if (bundle && (d.type === 'reel' || d.type === 'story')) continue;
    if (d.type === 'reel' || d.type === 'story' || d.type === 'post') sum += (card[d.type] ?? 0) * d.qty;
  }
  return sum;
}

export type ReasonInput = {
  /** 1-based brand rank among the campaign's agreed deals (0 = unknown). */
  rank: number;
  total: number;
  cash_usd: number;
  deliverables: Deliverable[];
  /** Rate card price for the deliverables; 0 skips the comparison. */
  fair_usd: number;
  /** matchMarket explain line for the deal. */
  explain?: string;
};

function fairPart(cash: number, fair: number): string {
  if (!(fair > 0)) return '';
  const pct = Math.round(((fair - cash) / fair) * 100);
  if (pct > 0) return `, ${pct} percent under fair`;
  if (pct < 0) return `, ${-pct} percent over fair`;
  return ', at fair price';
}

/** Winner: "Best value: $1,200 for 1 reel + 1 story, 6 percent under fair". */
export function winnerReason(r: ReasonInput): string {
  const pkg = packageLabel(r.deliverables);
  const what = `${usd(r.cash_usd)}${pkg ? ` for ${pkg}` : ''}${fairPart(r.cash_usd, r.fair_usd)}`;
  if (r.rank <= 1) return `Best value: ${what}`;
  return `Ranked ${ordinal(r.rank)} of ${r.total} on value for the brand: ${what}`;
}

/** Not selected: "Ranked 2nd of 3 on value for the brand", or why the match passed on it. */
export function otherReason(r: ReasonInput): string {
  const ranked = r.rank > 0 ? `Ranked ${ordinal(r.rank)} of ${r.total} on value for the brand` : 'Not ranked for the brand';
  const explain = r.explain ?? '';
  if (explain.startsWith('rejected by creator')) return `${ranked}, and the creator had no open slot`;
  if (explain.startsWith('skipped: budget')) return `${ranked}, and it did not fit the budget`;
  return ranked;
}
