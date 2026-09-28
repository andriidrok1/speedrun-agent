import { describe, expect, it } from 'vitest';
import { fairPrice, ordinal, otherReason, packageLabel, usd, winnerReason } from '../src/market/reasons';
import { profileFromScraped } from '../src/pricing';
import type { Deliverable } from '../src/types';

const reelStory: Deliverable[] = [{ type: 'reel', qty: 1 }, { type: 'story', qty: 1 }];

describe('finalize reasons', () => {
  it('formats ordinals, money and packages', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
    expect(usd(1200)).toBe('$1,200');
    expect(usd(586.5)).toBe('$586.50');
    expect(packageLabel([{ type: 'reel', qty: 1 }, { type: 'story', qty: 3 }])).toBe('1 reel + 3 stories');
    expect(packageLabel([])).toBe('');
  });

  it('fair price comes from the public rate card', () => {
    const creator = profileFromScraped('nick', { handle: '@nick', platform: 'instagram', followers: 1, avgViews30d: 1, engagement: 0.03, fairPrice: 586 });
    expect(fairPrice(reelStory, creator)).toBe(586 + Math.round(586 * 0.16));
    expect(fairPrice(reelStory, undefined)).toBe(0);
    expect(fairPrice([{ type: 'reel', qty: 1 }, { type: 'story', qty: 3 }], creator)).toBe(creator.public.rate_card.bundle_reel_3_stories);
  });

  it('winner: best value with the fair comparison, or its rank', () => {
    const base = { total: 3, cash_usd: 1200, deliverables: reelStory, fair_usd: 1277 };
    expect(winnerReason({ ...base, rank: 1 })).toBe('Best value: $1,200 for 1 reel + 1 story, 6 percent under fair');
    expect(winnerReason({ ...base, rank: 2, fair_usd: 1000 })).toBe('Ranked 2nd of 3 on value for the brand: $1,200 for 1 reel + 1 story, 20 percent over fair');
    expect(winnerReason({ ...base, rank: 1, fair_usd: 1200 })).toBe('Best value: $1,200 for 1 reel + 1 story, at fair price');
    expect(winnerReason({ ...base, rank: 1, fair_usd: 0, deliverables: [] })).toBe('Best value: $1,200');
  });

  it('others: rank, plus why the match passed when it was not just headcount', () => {
    const base = { total: 3, cash_usd: 900, deliverables: reelStory, fair_usd: 0 };
    expect(otherReason({ ...base, rank: 2, explain: 'not proposed: brand headcount reached (1/1)' })).toBe('Ranked 2nd of 3 on value for the brand');
    expect(otherReason({ ...base, rank: 3, explain: 'skipped: budget (would exceed 2000 by 500)' })).toBe('Ranked 3rd of 3 on value for the brand, and it did not fit the budget');
    expect(otherReason({ ...base, rank: 2, explain: 'rejected by creator: slots full (kept #1)' })).toBe('Ranked 2nd of 3 on value for the brand, and the creator had no open slot');
  });
});
