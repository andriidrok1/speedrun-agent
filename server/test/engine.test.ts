import { describe, expect, it } from 'vitest';
import { loadBrand, loadCreator } from '../src/profiles';
import type { Offer, Package } from '../src/types';
import {
  brandCap, creatorRequired, evaluate, runNegotiation, valueForBrand, valueForCreator, defaultTerms,
} from '../src/engine/index';

const NOW = new Date('2026-09-28T12:00:00Z');
const brand = () => loadBrand('marine-layer');
const creator = () => loadCreator('maya-wears');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('engine: Marine Layer x Maya', () => {
  it('(a) converges in <= 6 rounds inside both sides\' limits', () => {
    const b = brand();
    const c = creator();
    const r = runNegotiation({ brand: b, creator: c, now: NOW });
    expect(r.outcome).toBe('agreed');
    expect(r.rounds).toBeLessThanOrEqual(6);
    expect(r.acceptedOffer).toBeDefined();
    const accepted = r.acceptedOffer as Offer;
    expect(valueForBrand(accepted.package, b)).toBeLessThanOrEqual(6500);
    expect(valueForBrand(accepted.package, b)).toBeLessThanOrEqual(brandCap(b));
    expect(valueForCreator(accepted.package, accepted, c)).toBeGreaterThanOrEqual(creatorRequired(accepted, c, NOW));
    expect(r.turns[r.turns.length - 1].status).toBe('accept');
    // transcript hygiene: no private numbers leak
    const text = JSON.stringify(r.turns);
    expect(text).not.toContain('6500');
    expect(text).not.toContain('"3000"');
    expect(text).not.toMatch(/floor|wholesale|budget/i);
  });

  it('(b) the two sides value the same product package differently', () => {
    const b = brand();
    const c = creator();
    const pkg: Package = {
      cash_usd: 0,
      product: [{ sku: 'Cloud 9 Fleece Relaxed Hoodie', retail_value_usd: 118, qty: 2 }],
      affiliate_pct: 0, store_credit_usd: 0, custom: [],
    };
    const vb = valueForBrand(pkg, b);
    const vc = valueForCreator(pkg, defaultTerms(b), c);
    expect(vb).toBeCloseTo(94.4, 2); // wholesale
    expect(vc).toBeCloseTo(118, 2); // 50% of retail
    expect(vb).not.toBe(vc);
  });

  it('(b2) custom items match fuzzily and affiliate below her minimum counts as zero', () => {
    const b = brand();
    const c = creator();
    const terms = defaultTerms(b);
    const pkg: Package = { cash_usd: 0, product: [], affiliate_pct: 10, store_credit_usd: 0, custom: b.public.barter_menu.custom };
    expect(valueForCreator(pkg, terms, c)).toBe(500 + 500 + 100); // event + feature + early access, affiliate 10% < 15% min
    expect(valueForBrand(pkg, b)).toBe(150 + 100 + 25 + 450);
    expect(() => valueForBrand({ ...pkg, product: [{ sku: 'Nope', retail_value_usd: 1, qty: 1 }] }, b)).toThrow(/Nope/);
  });

  it('(c) creator floor above the brand cap walks away without looping', () => {
    const b = brand();
    const c = clone(creator());
    c.private.floor_usd.bundle_reel_3_stories = 9000;
    c.private.floor_usd.reel = 7000;
    const r = runNegotiation({ brand: b, creator: c, now: NOW });
    expect(r.outcome).toBe('walked_away');
    expect(r.acceptedOffer).toBeUndefined();
    expect(r.rounds).toBeLessThanOrEqual(6);
    expect(r.turns.length).toBeLessThanOrEqual(13);
    expect(r.turns[r.turns.length - 1].status).toBe('walk_away');
  });

  it('(d) creator rejects 90-day exclusivity', () => {
    const b = brand();
    const c = creator();
    const offer: Offer = {
      round: 1, from: 'brand',
      package: { cash_usd: 10000, product: [], affiliate_pct: 20, store_credit_usd: 0, custom: [] },
      ...defaultTerms(b),
      exclusivity: { category: 'apparel', days: 90 },
      message: '', status: 'offer',
    };
    const v = evaluate(offer, 'creator', b, c, { now: NOW });
    expect(v.accept).toBe(false);
    expect(v.reason).toMatch(/exclusivity/i);
    // same money with 30 days is a yes
    expect(evaluate({ ...offer, exclusivity: { category: 'apparel', days: 30 } }, 'creator', b, c, { now: NOW }).accept).toBe(true);
  });

  it('premiums: rush and paid ads raise the required number', () => {
    const c = creator();
    const base = defaultTerms(brand());
    expect(creatorRequired(base, c, NOW)).toBe(3450); // 3000 bundle * 1.15 (30d exclusivity)
    expect(creatorRequired({ ...base, usage_rights: 'paid_ads_30d' }, c, NOW)).toBe(4350); // +30
    expect(creatorRequired({ ...base, deadline: '2026-10-01' }, c, NOW)).toBe(4200); // +25 rush
  });
});
