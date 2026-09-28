import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadBrand, loadCreator } from '../src/profiles';
import type { Deal, MarketInput, Offer } from '../src/types';
import { isStable, matchMarket, dealRanks } from '../src/market/match';
import { rankBrand, rankCreator, scoreForBrand, scoreForCreator } from '../src/market/score';

const deal = (id: string, brandId: string, creatorId: string, cash_usd: number) => ({ id, brandId, creatorId, cash_usd });

describe('market: matchMarket', () => {
  it('(a) budget cuts: walks prefs in order, skips what does not fit, keeps going', () => {
    const input: MarketInput = {
      brands: [{ id: 'B', budget_usd: 5000, headcount: 3, prefs: ['d1', 'd2', 'd3'] }],
      creators: [
        { id: 'c1', slots: 1, prefs: ['d1'] },
        { id: 'c2', slots: 1, prefs: ['d2'] },
        { id: 'c3', slots: 1, prefs: ['d3'] },
      ],
      deals: [deal('d1', 'B', 'c1', 3000), deal('d2', 'B', 'c2', 2500), deal('d3', 'B', 'c3', 2000)],
    };
    const r = matchMarket(input);
    expect(r.selected).toEqual(['d1', 'd3']);
    expect(r.explain.d1).toBe('selected: #1 for brand, #1 for creator');
    // explain reflects the final pass: brand holds 3000 + 2000 = 5000, so 2500 more would exceed by 2500
    expect(r.explain.d2).toBe('skipped: budget (would exceed 5000 by 2500)');
    expect(r.explain.d3).toBe('selected: #3 for brand, #1 for creator');
    expect(Object.keys(r.explain).sort()).toEqual(['d1', 'd2', 'd3']);
    expect(isStable(input, r).stable).toBe(true);
  });

  it('(b) slots cut: creator with 1 slot keeps the brand she ranks higher; loser moves down its list', () => {
    const input: MarketInput = {
      brands: [
        { id: 'A', budget_usd: 10000, headcount: 1, prefs: ['a-maya', 'a-other'] },
        { id: 'B', budget_usd: 10000, headcount: 1, prefs: ['b-maya'] },
      ],
      creators: [
        { id: 'maya', slots: 1, prefs: ['b-maya', 'a-maya'] },
        { id: 'other', slots: 1, prefs: ['a-other'] },
      ],
      deals: [deal('a-maya', 'A', 'maya', 3000), deal('a-other', 'A', 'other', 1500), deal('b-maya', 'B', 'maya', 2800)],
    };
    const r = matchMarket(input);
    expect(r.selected.sort()).toEqual(['a-other', 'b-maya']);
    expect(r.explain['b-maya']).toBe('selected: #1 for brand, #1 for creator');
    expect(r.explain['a-maya']).toBe('rejected by creator: slots full (kept #1)');
    expect(r.explain['a-other']).toBe('selected: #2 for brand, #1 for creator');
    expect(isStable(input, r).stable).toBe(true);
    expect(dealRanks(input, 'a-maya')).toEqual({ brand: 1, creator: 2 });
  });

  it('(c) stability on a 3x3 instance with headcount 2 and slots 2', () => {
    const brandIds = ['b1', 'b2', 'b3'];
    const creatorIds = ['c1', 'c2', 'c3'];
    const deals = brandIds.flatMap((b, i) => creatorIds.map((c, j) => deal(`${b}-${c}`, b, c, 1000 + 300 * i + 150 * j)));
    const input: MarketInput = {
      brands: [
        { id: 'b1', budget_usd: 100000, headcount: 2, prefs: ['b1-c2', 'b1-c1', 'b1-c3'] },
        { id: 'b2', budget_usd: 100000, headcount: 2, prefs: ['b2-c2', 'b2-c3', 'b2-c1'] },
        { id: 'b3', budget_usd: 100000, headcount: 2, prefs: ['b3-c1', 'b3-c2', 'b3-c3'] },
      ],
      creators: [
        { id: 'c1', slots: 2, prefs: ['b2-c1', 'b3-c1', 'b1-c1'] },
        { id: 'c2', slots: 2, prefs: ['b3-c2', 'b1-c2', 'b2-c2'] },
        { id: 'c3', slots: 2, prefs: ['b1-c3', 'b2-c3', 'b3-c3'] },
      ],
      deals,
    };
    const r = matchMarket(input);
    expect(Object.keys(r.explain).sort()).toEqual(deals.map((d) => d.id).sort());
    expect(r.selected.length).toBe(6);
    const st = isStable(input, r);
    expect(st.blockingPairs).toEqual([]);
    expect(st.stable).toBe(true);
    // deterministic
    expect(matchMarket(input)).toEqual(r);
    // c1 ranks b1 last and gets b2 + b3, so b1 is bumped from c1 and falls through to c3
    expect(r.selected.sort()).toEqual(['b1-c2', 'b1-c3', 'b2-c1', 'b2-c3', 'b3-c1', 'b3-c2']);
    expect(r.explain['b1-c1']).toBe('rejected by creator: slots full (kept #1,#2)');
    expect(r.explain['b1-c3']).toBe('selected: #3 for brand, #1 for creator');
  });

  it('(d) empty input', () => {
    expect(matchMarket({ brands: [], creators: [], deals: [] })).toEqual({ selected: [], explain: {} });
  });

  it('(e) deals the creator never listed are never held', () => {
    const input: MarketInput = {
      brands: [{ id: 'A', budget_usd: 9999, headcount: 2, prefs: ['x', 'y'] }],
      creators: [{ id: 'c', slots: 2, prefs: ['y'] }],
      deals: [deal('x', 'A', 'c', 100), deal('y', 'A', 'c', 100)],
    };
    const r = matchMarket(input);
    expect(r.selected).toEqual(['y']);
    expect(r.explain.x).toBe('rejected by creator: creator has no preference for this deal');
  });
});

describe('market: scoring with real profiles', () => {
  const file = join(import.meta.dirname, '..', '..', 'transcripts', 'marine-layer__maya-wears__2026-09-28T12-00-00.000Z.json');
  const transcript = JSON.parse(readFileSync(file, 'utf8')) as { now: string; acceptedOffer: Offer };
  const NOW = new Date(transcript.now);
  const brand = loadBrand('marine-layer');
  const creator = loadCreator('maya-wears');
  const mk = (dealId: string, offer: Offer): Deal => ({
    dealId, campaignId: 'camp', brandSlug: 'marine-layer', creatorSlug: 'maya-wears', status: 'agreed',
    price: offer.package.cash_usd, budgetLeft: 0, acceptedOffer: offer, createdAt: transcript.now, updatedAt: transcript.now,
  });

  it('brand surplus >= 0 (value <= cap), creator surplus >= 0, cpm from first platform', () => {
    const d = mk('deal-1', transcript.acceptedOffer);
    const b = scoreForBrand(d, brand, creator, NOW);
    expect(b.cap_usd).toBe(6500);
    expect(b.value_usd).toBeLessThanOrEqual(b.cap_usd);
    expect(b.surplus_usd).toBe(b.cap_usd - b.value_usd);
    expect(b.cash_usd).toBe(3277.4);
    expect(b.implied_cpm_usd).toBe(34.5); // 3277.4 / (95000 / 1000)

    const c = scoreForCreator(d, creator, brand, NOW);
    expect(c.surplus_usd).toBeGreaterThanOrEqual(0);
    expect(c.value_usd).toBe(4248.4);
    expect(c.required_usd).toBe(3450); // bundle floor 3000 * (1 + 15% exclusivity for 30d)
    expect(c.surplus_usd).toBe(798.4);
  });

  it('throws with dealId when acceptedOffer is missing', () => {
    const d = mk('no-offer', transcript.acceptedOffer);
    delete d.acceptedOffer;
    expect(() => scoreForBrand(d, brand, creator, NOW)).toThrow(/no-offer/);
    expect(() => scoreForCreator(d, creator, brand, NOW)).toThrow(/no-offer/);
  });

  it('rankBrand: surplus desc, cpm asc, null cpm last; rankCreator: surplus desc, cash desc', () => {
    const rb = rankBrand([
      { dealId: 'lowSurplus', surplus_usd: 100, value_usd: 0, cap_usd: 0, cash_usd: 0, implied_cpm_usd: 1 },
      { dealId: 'nullCpm', surplus_usd: 500, value_usd: 0, cap_usd: 0, cash_usd: 0, implied_cpm_usd: null },
      { dealId: 'highCpm', surplus_usd: 500, value_usd: 0, cap_usd: 0, cash_usd: 0, implied_cpm_usd: 40 },
      { dealId: 'lowCpm', surplus_usd: 500, value_usd: 0, cap_usd: 0, cash_usd: 0, implied_cpm_usd: 20 },
    ]);
    expect(rb.map((s) => s.dealId)).toEqual(['lowCpm', 'highCpm', 'nullCpm', 'lowSurplus']);

    const rc = rankCreator([
      { dealId: 'a', surplus_usd: 10, value_usd: 0, required_usd: 0, cash_usd: 100 },
      { dealId: 'b', surplus_usd: 10, value_usd: 0, required_usd: 0, cash_usd: 300 },
      { dealId: 'c', surplus_usd: 50, value_usd: 0, required_usd: 0, cash_usd: 0 },
    ]);
    expect(rc.map((s) => s.dealId)).toEqual(['c', 'b', 'a']);
  });
});
