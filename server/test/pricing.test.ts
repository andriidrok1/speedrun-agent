import { describe, expect, it } from 'vitest';
import { runNegotiation } from '../src/engine/index';
import { loadBrand } from '../src/profiles';
import { brandForCreator, creatorForBrand, profileFromScraped, BRAND_FLEX } from '../src/pricing';
import type { Creator } from '../src/types';

const creator = (handle: string, avgViews30d: number, fairPrice: number): Creator => ({
  handle, platform: 'instagram', followers: 300_000, avgViews30d, engagement: 0.04, fairPrice,
});
const now = new Date('2026-09-28T12:00:00Z');

function cash(c: Creator): number {
  const profile = profileFromScraped(c.handle.slice(1), c);
  const brand = brandForCreator(loadBrand('marine-layer'), profile);
  const r = runNegotiation({ brand, creator: profile, now });
  return r.outcome === 'agreed' ? r.acceptedOffer!.package.cash_usd : -1;
}

describe('brandForCreator', () => {
  it('caps the brand at 1.3x the creator bundle rate', () => {
    const profile = profileFromScraped('nick', creator('@nick', 47_000, 833));
    const brand = brandForCreator(loadBrand('marine-layer'), profile);
    expect(brand.private.budget_per_creator_max_usd).toBe(Math.round(profile.public.rate_card.bundle_reel_3_stories * BRAND_FLEX));
  });

  it('never raises the brand max', () => {
    const profile = profileFromScraped('big', creator('@big', 2_000_000, 40_000));
    const base = loadBrand('marine-layer');
    expect(brandForCreator(base, profile)).toBe(base);
  });

  it('pays more for more reach, and a tiny account gets no inflated cash', () => {
    const small = cash(creator('@small', 600, 10));
    const mid = cash(creator('@mid', 47_000, 833));
    const big = cash(creator('@big', 65_000, 1212));
    expect(small).toBeLessThan(50);
    expect(mid).toBeGreaterThan(small);
    expect(big).toBeGreaterThan(mid);
    expect(mid).toBeLessThanOrEqual(833 * 1.4 * BRAND_FLEX);
  });
});

describe('creatorForBrand', () => {
  const base = profileFromScraped('nick', creator('@nick', 47_000, 833));
  const fav = {
    ...base,
    private: { ...base.private, preferred_brands: { names: ['OpenAI', 'Anthropic'], floor_usd: { reel: 500, story: 75, post: 200, bundle_reel_3_stories: 725 } } },
  };
  const brandNamed = (name: string) => {
    const b = loadBrand('marine-layer');
    return { ...b, public: { ...b.public, name } };
  };

  it('uses the favorite floors for a favorite brand', () => {
    expect(creatorForBrand(fav, brandNamed('Anthropic')).private.floor_usd.reel).toBe(500);
    expect(creatorForBrand(fav, brandNamed('openai inc')).private.floor_usd.reel).toBe(500);
  });

  it('keeps the normal floors for everyone else', () => {
    expect(creatorForBrand(fav, brandNamed('Cluely')).private.floor_usd.reel).toBe(base.private.floor_usd.reel);
    expect(creatorForBrand(base, brandNamed('Anthropic'))).toBe(base);
  });
});
