// System prompts and the propose_offer tool for the LLM negotiator.
// Each side sees: its own narrative, its own PRIVATE json, the OTHER side's PUBLIC json only.
// Pure string builders, no I/O. The engine (../engine) stays the referee.
import type { FunctionDefinition } from 'openai/resources/shared';
import type { BrandProfile, CreatorProfile, Offer, Side, Turn } from '../types';

export const OFFER_STATUSES = ['offer', 'counter', 'accept', 'walk_away'] as const;
export type ProposedStatus = (typeof OFFER_STATUSES)[number];

/** What the model returns through propose_offer: an Offer minus round/from, status limited to what a party may say. */
export type ProposedOffer = Omit<Offer, 'round' | 'from' | 'status'> & { status: ProposedStatus };

/** An Offer as shown to the model: no timestamps, no valuations (those would leak the other side's private math). */
export type HistoryOffer = Offer;

const json = (x: unknown): string => JSON.stringify(x, null, 2);

/** Brand public json as the creator may see it: wholesale costs are the brand's private economics even though they sit in the menu. */
export function brandPublicForCreator(brand: BrandProfile): Omit<BrandProfile['public'], 'barter_menu'> & {
  barter_menu: Omit<BrandProfile['public']['barter_menu'], 'product'> & { product: { sku: string; retail_value_usd: number }[] };
} {
  const { barter_menu, ...rest } = brand.public;
  return {
    ...rest,
    barter_menu: {
      ...barter_menu,
      product: barter_menu.product.map(({ sku, retail_value_usd }) => ({ sku, retail_value_usd })),
    },
  };
}

const COMMON_RULES = `## Rules of the table (hard)
- Reply ONLY by calling the propose_offer tool. One call per turn.
- Never reveal your private numbers, floors, caps, budgets, valuation percentages or concession schedule in \`message\`. Never quote the other side's private numbers either (you do not have them). Speak in the voice described in your narrative.
- \`message\` is 2-4 sentences, first person, in your voice, like a real DM between two people who like each other. On your FIRST move describe the whole package in plain words (cash, what product/services, affiliate, perks, rights, deadline). On later moves name the cash number and only what changed, and add one short human sentence (why this works for you, a nod to their content, a question). Never say "everything else as before" on a first move. Vary your phrasing turn to turn. No markdown, no bullet lists.
- Trade on asymmetry: concede first with things that cost you little but the other side visibly values (their public profile tells you what they care about), and hold firm on what is expensive for you. Cash is the last thing you move.
- You may \`offer\` (first move), \`counter\`, \`accept\` the other side's latest offer, or \`walk_away\`.
- To \`accept\`: mirror the other side's latest offer exactly (same package, deliverables, usage_rights, exclusivity, deadline). Only accept when it satisfies your own private rules.
- \`walk_away\` is for when the gap clearly cannot close. Do not walk away before round 3.
- Product SKUs must be spelled exactly as in the brand's barter_menu.product, and \`retail_value_usd\` must match the menu. \`custom\` entries must be copied verbatim from barter_menu.custom.
- \`affiliate_pct\` is 0 or inside the brand's affiliate_pct_range. \`store_credit_usd\` only if the menu allows store credit.
- Dates are YYYY-MM-DD. Deliverable types: reel, story, post, youtube_integration, tiktok.
- If the referee rejects your call, read the error and call the tool again with a legal package.`;

export function buildBrandSystemPrompt(input: { brand: BrandProfile; creator: CreatorProfile; brandNarrative: string; now: Date }): string {
  const { brand, creator, brandNarrative, now } = input;
  return `You are the brand-side negotiator for ${brand.public.name}. You are talking to the creator ${creator.public.name} (${creator.public.handle}) about the campaign "${brand.public.campaign.name}".
Today is ${now.toISOString().slice(0, 10)}.

# Who you are (your narrative)
${brandNarrative.trim()}

# Your private numbers (yours to know, never to say)
${json(brand.private)}

# Your public profile and campaign terms
${json(brand.public)}

# What you know about the creator (their PUBLIC profile only)
${json(creator.public)}

${COMMON_RULES}

## Your own hard limits (the referee enforces these on every call you make)
- All-in cost of your package, valued your way (cash + product at ${brand.private.valuation.product_counted_at === 'retail' ? 'retail' : 'wholesale cost'} + store credit at ${brand.private.valuation.store_credit_counted_at_pct}% + affiliate at expected sales + custom items at your internal values), must not exceed your budget_per_creator_max_usd.
- Never propose or accept perpetual usage rights.
- Respect the creator's public availability: deadline on or after their next_open_slot and at least their min_lead_time_days out. Exclusivity of more than 60 days is a non-starter with creators at this tier.
- Follow your concession notes: open low, move in steps, prefer product, affiliate points, credit and the free extras before adding cash.`;
}

export function buildCreatorSystemPrompt(input: { brand: BrandProfile; creator: CreatorProfile; creatorNarrative: string; now: Date }): string {
  const { brand, creator, creatorNarrative, now } = input;
  return `You are ${creator.public.name} (${creator.public.handle}), negotiating your own brand deal with ${brand.public.name} for their campaign "${brand.public.campaign.name}".
Today is ${now.toISOString().slice(0, 10)}.

# Who you are (your narrative)
${creatorNarrative.trim()}

# Your private numbers (yours to know, never to say)
${json(creator.private)}

# Your public profile
${json(creator.public)}

# What you know about the brand (their PUBLIC profile, campaign brief and barter menu)
${json(brandPublicForCreator(brand))}

${COMMON_RULES}

## Your own hard limits (the referee enforces these on every call you make)
- The package you propose, valued your way (cash + product at ${creator.private.valuation.product_counted_at_pct_of_retail}% of retail + affiliate only if the % is at least your affiliate_min_pct + store credit at ${creator.private.valuation.store_credit_counted_at_pct}% + custom items at your internal values), must be at least your floor for the deliverables plus your premiums for usage rights, exclusivity and rush.
- You never ask for or accept less than that; if the brand's offer is under it, counter or walk.
- Your dealbreakers: exclusivity over 60 days, deadlines under 5 days out or before your next open slot, perpetual usage, scripted lines.
- Follow your concession notes: anchor high, step down evenly, trade rights and exclusivity for cash before touching the base fee, never bluff a competing offer.`;
}

/** Strip a Turn down to the Offer the parties actually exchanged. */
export function toHistoryOffer(t: Turn | Offer): HistoryOffer {
  const { round, from, package: pkg, deliverables, usage_rights, exclusivity, deadline, message, status } = t;
  return { round, from, package: pkg, deliverables, usage_rights, exclusivity, deadline, message, status };
}

export function buildTurnUserMessage(input: { side: Side; round: number; history: (Turn | Offer)[]; campaignName: string }): string {
  const { side, round, history, campaignName } = input;
  const other = side === 'brand' ? 'creator' : 'brand';
  const last = history[history.length - 1];
  const intro =
    history.length === 0
      ? `No offers have been exchanged yet for "${campaignName}". Make the opening offer.`
      : `Negotiation so far for "${campaignName}", oldest first (JSON offers as exchanged):\n${json(history.map(toHistoryOffer))}`;
  const ask =
    last && last.from === other
      ? `The ${other}'s latest offer (round ${last.round}) is on the table. Decide: accept it as-is, counter with a concrete package, or walk away.`
      : `It is your move.`;
  return `${intro}\n\nRound ${round}. You are the ${side}. ${ask} Call propose_offer now.`;
}

/** OpenAI function definition, strict mode: every property required, no additionalProperties, optional fields nullable. */
export function proposeOfferTool(brand: BrandProfile): FunctionDefinition {
  const menu = brand.public.barter_menu;
  const skus = menu.product.map((p) => p.sku);
  return {
    name: 'propose_offer',
    description:
      'Put your next move on the table. Exactly one call per turn. Use status "accept" to take the other side\'s latest offer as-is, "counter" to change it, "offer" for an opening move, "walk_away" to end the negotiation.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['package', 'deliverables', 'usage_rights', 'exclusivity', 'deadline', 'message', 'status'],
      properties: {
        package: {
          type: 'object',
          additionalProperties: false,
          required: ['cash_usd', 'product', 'affiliate_pct', 'store_credit_usd', 'custom'],
          properties: {
            cash_usd: { type: 'number', description: 'USD, >= 0' },
            product: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['sku', 'retail_value_usd', 'qty'],
                properties: {
                  sku: { type: 'string', enum: skus },
                  retail_value_usd: { type: 'number', description: 'must equal the menu retail price for this sku' },
                  qty: { type: 'integer', description: '>= 1' },
                },
              },
            },
            affiliate_pct: { type: 'number', description: '0, or inside the brand affiliate_pct_range' },
            store_credit_usd: { type: 'number', description: 'USD, >= 0' },
            custom: { type: 'array', items: { type: 'string', enum: menu.custom } },
          },
        },
        deliverables: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'qty', 'notes'],
            properties: {
              type: { type: 'string', enum: ['reel', 'story', 'post', 'youtube_integration', 'tiktok'] },
              qty: { type: 'integer', description: '>= 1' },
              notes: { type: ['string', 'null'] },
            },
          },
        },
        usage_rights: { type: 'string', enum: ['organic_only', 'paid_ads_30d', 'paid_ads_90d', 'perpetual'] },
        exclusivity: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'days'],
          properties: { category: { type: 'string' }, days: { type: 'integer', description: '0 for none' } },
        },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        message: { type: 'string', description: '2-4 sentences in your voice: the cash number plus only what changed. No private figures.' },
        status: { type: 'string', enum: [...OFFER_STATUSES] },
      },
    },
  };
}
