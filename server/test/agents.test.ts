// Prompt-building tests only. No network.
import { describe, expect, it } from 'vitest';
import { loadBrand, loadBrandNarrative, loadCreator, loadCreatorNarrative } from '../src/profiles';
import {
  brandPublicForCreator, buildBrandSystemPrompt, buildCreatorSystemPrompt, buildTurnUserMessage, proposeOfferTool, toHistoryOffer,
} from '../src/agents/prompts';
import { runNegotiation } from '../src/engine/index';

const NOW = new Date('2026-09-28T12:00:00Z');
const brand = loadBrand('marine-layer');
const creator = loadCreator('maya-wears');
const brandPrompt = () => buildBrandSystemPrompt({ brand, creator, brandNarrative: loadBrandNarrative('marine-layer'), now: NOW });
const creatorPrompt = () => buildCreatorSystemPrompt({ brand, creator, creatorNarrative: loadCreatorNarrative('maya-wears'), now: NOW });

describe('agents/prompts: information walls', () => {
  it('brand prompt has the brand private json and the creator public json, no creator private numbers', () => {
    const p = brandPrompt();
    expect(p).toContain('"budget_per_creator_max_usd": 6500');
    expect(p).toContain('"handle": "@maya.wears"');
    expect(p).toContain('"reel": 2800'); // public rate card is fine
    expect(p).not.toContain('2100'); // reel floor
    expect(p).not.toContain('3000'); // bundle floor
    expect(p).not.toMatch(/\b1800\b/); // her affiliate expectation (18000 YouTube views is public)
    expect(p).not.toMatch(/floor_usd|dealbreakers|stop_brands|first_ask_pct_over_floor/);
  });

  it('creator prompt has the creator private json and the brand public json, no brand private numbers', () => {
    const p = creatorPrompt();
    expect(p).toContain('"bundle_reel_3_stories": 3000');
    expect(p).toContain('"name": "Marine Layer"');
    expect(p).toContain('Invite to SF HQ Re-Spun launch event (Oct 2026)');
    expect(p).not.toContain('6500');
    expect(p).not.toContain('4500'); // brand affiliate expectation
    expect(p).not.toContain('50000');
    expect(p).not.toMatch(/wholesale|budget_per_creator_max_usd|first_offer_pct_of_max|walk_away_if/i);
  });

  it('brandPublicForCreator strips wholesale cost but keeps sku and retail', () => {
    const pub = brandPublicForCreator(brand);
    expect(pub.barter_menu.product[0]).toEqual({ sku: 'Signature Crew Tee', retail_value_usd: 54 });
    expect(JSON.stringify(pub)).not.toContain('wholesale');
  });

  it('both prompts carry the table rules and the party voice', () => {
    for (const p of [brandPrompt(), creatorPrompt()]) {
      expect(p).toContain('propose_offer');
      expect(p).toContain('Never reveal your private numbers');
      expect(p).toContain('2-4 sentences');
    }
    expect(brandPrompt()).toContain('Warm, a little goofy');
    expect(creatorPrompt()).toContain('Temescal');
  });
});

describe('agents/prompts: tool and history', () => {
  it('propose_offer is a strict function schema with the menu SKUs and custom items as enums', () => {
    const t = proposeOfferTool(brand);
    expect(t.name).toBe('propose_offer');
    expect(t.strict).toBe(true);
    const params = t.parameters as { properties: { package: { properties: { product: { items: { properties: { sku: { enum: string[] } } } }; custom: { items: { enum: string[] } } } }; status: { enum: string[] } } };
    expect(params.properties.package.properties.product.items.properties.sku.enum).toEqual(brand.public.barter_menu.product.map((p) => p.sku));
    expect(params.properties.package.properties.custom.items.enum).toEqual(brand.public.barter_menu.custom);
    expect(params.properties.status.enum).toEqual(['offer', 'counter', 'accept', 'walk_away']);
    expect(JSON.stringify(t)).not.toContain('wholesale');
  });

  it('history shown to the model has offers only: no ts, no value_for_* fields', () => {
    const r = runNegotiation({ brand, creator, now: NOW });
    const msg = buildTurnUserMessage({ side: 'creator', round: 2, history: r.turns.slice(0, 3), campaignName: brand.public.campaign.name });
    expect(msg).toContain('Round 2. You are the creator.');
    expect(msg).toContain('"round": 1');
    expect(msg).not.toContain('value_for_brand_usd');
    expect(msg).not.toContain('value_for_creator_usd');
    expect(msg).not.toContain('"ts"');
    const stripped = toHistoryOffer(r.turns[0]);
    expect(Object.keys(stripped).sort()).toEqual(['deadline', 'deliverables', 'exclusivity', 'from', 'message', 'package', 'round', 'status', 'usage_rights']);
  });

  it('opening move gets an explicit "no offers yet" user message', () => {
    const msg = buildTurnUserMessage({ side: 'brand', round: 1, history: [], campaignName: 'X' });
    expect(msg).toContain('No offers have been exchanged yet');
    expect(msg).toContain('Make the opening offer');
  });
});
