// LLM negotiation: the model picks the package and writes the message, the engine keeps it legal.
// Same output shape as runNegotiation plus rule_violations / substitutions counters.
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { BrandProfile, CreatorProfile, Deliverable, Offer, Package, Side, Turn } from '../types';
import type { NegotiationResult } from '../engine/index';
import {
  brandCap, brandNextOffer, creatorAtFloor, creatorNextOffer, creatorRequired, daysUntil, evaluate,
  valueForBrand, valueForCreator, type NegotiationCtx,
} from '../engine/index';
import { proposeTurn, type LlmClient } from './llm';
import {
  buildBrandSystemPrompt, buildCreatorSystemPrompt, buildTurnUserMessage, proposeOfferTool,
  OFFER_STATUSES, toHistoryOffer, type ProposedOffer,
} from './prompts';

export type NegotiationResultLLM = NegotiationResult & {
  rule_violations: number;
  substitutions: number;
  /** Set when no price can work for these deliverables: brand max is below the creator minimum. */
  walk_reason?: 'budget_gap';
  gap_usd?: number;
};

export type NegotiationInputLLM = {
  brand: BrandProfile;
  creator: CreatorProfile;
  brandNarrative: string;
  creatorNarrative: string;
  now: Date;
  client: LlmClient;
  maxRounds?: number;
  /** One line per model call, as it happens. Defaults to stderr. */
  log?: (line: string) => void;
  /** Called as each turn is finalized, so callers can persist a live transcript. */
  onTurn?: (turn: Turn) => void;
};

const HARD_ROUND_LIMIT = 50;
/** Demo pacing: deals resolve in about a minute. */
const DEFAULT_MAX_ROUNDS = 4;
/** From this round on, a cash gap switches the agents from haggling to restructuring. */
const RESTRUCTURE_FROM_ROUND = 2;
const MAX_ATTEMPTS = 2;
const MIN_WALK_ROUND = 3;
// Mirror of the creator dealbreakers the engine enforces in rules.ts (its constants are not exported).
const MAX_EXCLUSIVITY_DAYS = 60;
const MIN_DEADLINE_DAYS = 5;

const USAGE = new Set(['organic_only', 'paid_ads_30d', 'paid_ads_90d', 'perpetual']);
const DELIVERABLE_TYPES = new Set(['reel', 'story', 'post', 'youtube_integration', 'tiktok']);
const money = (n: number): number => Math.round(n * 100) / 100;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

class RuleViolation extends Error {}

/** Shape-check the raw tool arguments. Throws RuleViolation with a message the model can act on. */
function parseProposed(raw: unknown, where: string): ProposedOffer {
  const fail = (msg: string): never => { throw new RuleViolation(`${where}: ${msg}`); };
  if (!raw || typeof raw !== 'object') return fail('arguments must be an object');
  const o = raw as Record<string, unknown>;
  const p = o.package as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') return fail('package is required');
  if (!isNum(p.cash_usd) || p.cash_usd < 0) return fail('package.cash_usd must be a number >= 0');
  if (!isNum(p.affiliate_pct) || p.affiliate_pct < 0 || p.affiliate_pct > 100) return fail('package.affiliate_pct must be 0..100');
  if (!isNum(p.store_credit_usd) || p.store_credit_usd < 0) return fail('package.store_credit_usd must be a number >= 0');
  if (!Array.isArray(p.product)) return fail('package.product must be an array');
  if (!Array.isArray(p.custom) || !p.custom.every((c) => typeof c === 'string')) return fail('package.custom must be an array of strings');
  const product = p.product.map((it, i) => {
    const x = it as Record<string, unknown>;
    if (typeof x.sku !== 'string' || !x.sku) return fail(`package.product[${i}].sku must be a string`);
    if (!isNum(x.retail_value_usd)) return fail(`package.product[${i}].retail_value_usd must be a number`);
    if (!Number.isInteger(x.qty) || (x.qty as number) < 1) return fail(`package.product[${i}].qty must be an integer >= 1`);
    return { sku: x.sku, retail_value_usd: x.retail_value_usd, qty: x.qty as number };
  });
  if (!Array.isArray(o.deliverables) || o.deliverables.length === 0) return fail('deliverables must be a non-empty array');
  const deliverables: Deliverable[] = o.deliverables.map((d, i) => {
    const x = d as Record<string, unknown>;
    if (typeof x.type !== 'string' || !DELIVERABLE_TYPES.has(x.type)) return fail(`deliverables[${i}].type must be one of ${[...DELIVERABLE_TYPES].join(', ')}`);
    if (!Number.isInteger(x.qty) || (x.qty as number) < 1) return fail(`deliverables[${i}].qty must be an integer >= 1`);
    const notes = typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim() : undefined;
    return { type: x.type as Deliverable['type'], qty: x.qty as number, ...(notes ? { notes } : {}) };
  });
  if (typeof o.usage_rights !== 'string' || !USAGE.has(o.usage_rights)) return fail('usage_rights must be one of organic_only, paid_ads_30d, paid_ads_90d, perpetual');
  const ex = o.exclusivity as Record<string, unknown> | undefined;
  if (!ex || typeof ex.category !== 'string' || !Number.isInteger(ex.days) || (ex.days as number) < 0) return fail('exclusivity must be { category: string, days: integer >= 0 }');
  if (typeof o.deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.deadline) || Number.isNaN(Date.parse(`${o.deadline}T00:00:00Z`))) return fail('deadline must be YYYY-MM-DD');
  if (typeof o.message !== 'string' || !o.message.trim()) return fail('message must be a non-empty string');
  if (typeof o.status !== 'string' || !(OFFER_STATUSES as readonly string[]).includes(o.status)) return fail(`status must be one of ${OFFER_STATUSES.join(', ')}`);
  return {
    package: { cash_usd: money(p.cash_usd), product, affiliate_pct: p.affiliate_pct, store_credit_usd: money(p.store_credit_usd), custom: p.custom as string[] },
    deliverables,
    usage_rights: o.usage_rights as Offer['usage_rights'],
    exclusivity: { category: ex.category, days: ex.days as number },
    deadline: o.deadline,
    message: o.message.trim(),
    status: o.status as ProposedOffer['status'],
  };
}

/** Package legality against the brand's public barter menu. Normalizes retail values to the menu. */
function checkPackage(pkg: Package, brand: BrandProfile, where: string): Package {
  const menu = brand.public.barter_menu;
  const product = pkg.product.map((it) => {
    const m = menu.product.find((p) => p.sku === it.sku);
    if (!m) throw new RuleViolation(`${where}: unknown sku "${it.sku}". Use exactly one of: ${menu.product.map((p) => p.sku).join(' | ')}`);
    return { sku: m.sku, retail_value_usd: m.retail_value_usd, qty: it.qty };
  });
  for (const c of pkg.custom) {
    if (!menu.custom.includes(c)) throw new RuleViolation(`${where}: custom item "${c}" is not on the menu. Copy verbatim from: ${menu.custom.join(' | ')}`);
  }
  const [lo, hi] = menu.affiliate_pct_range;
  if (pkg.affiliate_pct !== 0 && (pkg.affiliate_pct < lo || pkg.affiliate_pct > hi)) {
    throw new RuleViolation(`${where}: affiliate_pct ${pkg.affiliate_pct} must be 0 or between ${lo} and ${hi}`);
  }
  if (pkg.store_credit_usd > 0 && !menu.store_credit) throw new RuleViolation(`${where}: this brand does not offer store credit`);
  return { ...pkg, product };
}

/** Terms neither side may propose: the engine's creator dealbreakers plus the brand's perpetual no-go. */
function checkHardTerms(offer: Offer, brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx, where: string): void {
  if (offer.usage_rights === 'perpetual') throw new RuleViolation(`${where}: perpetual usage is off the table for ${brand.public.name}; 90-day paid ads is the ceiling`);
  if (offer.exclusivity.days > MAX_EXCLUSIVITY_DAYS) throw new RuleViolation(`${where}: exclusivity ${offer.exclusivity.days}d exceeds the ${MAX_EXCLUSIVITY_DAYS}d maximum`);
  const days = daysUntil(offer.deadline, ctx.now);
  if (days < MIN_DEADLINE_DAYS) throw new RuleViolation(`${where}: deadline ${offer.deadline} is ${days.toFixed(1)} days out, needs at least ${MIN_DEADLINE_DAYS}`);
  const slot = creator.public.availability.next_open_slot;
  if (slot && offer.deadline < slot) throw new RuleViolation(`${where}: deadline ${offer.deadline} is before the creator's next open slot ${slot}`);
}

/** The proposing side's own private rule. Errors name the side's own numbers only. */
function checkOwnRule(offer: Offer, side: Side, brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx, where: string): void {
  if (side === 'brand') {
    const v = valueForBrand(offer.package, brand);
    const cap = brandCap(brand);
    if (v > cap) throw new RuleViolation(`${where}: this package costs you ${v} all-in (cash + product at cost + credit + affiliate + extras), above your per-creator max ${cap}. Cut it by at least ${money(v - cap)}.`);
  } else {
    const v = valueForCreator(offer.package, offer, creator);
    const req = creatorRequired(offer, creator, ctx.now);
    if (v < req) throw new RuleViolation(`${where}: this package is worth ${v} to you but these terms (deliverables + rights + exclusivity + rush premiums) require at least ${req}. Ask for at least ${money(req - v)} more, or strip rights/exclusivity.`);
  }
}

const delivKey = (o: Offer): string =>
  o.deliverables.map((d) => `${d.qty}x${d.type}`).sort().join('+') + `|${o.usage_rights}`;

export const describeDeliverables = (o: Pick<Offer, 'deliverables'>): string =>
  o.deliverables.map((d) => `${d.qty} ${d.qty > 1 ? (d.type === 'story' ? 'stories' : `${d.type}s`) : d.type}`).join(' + ');

/**
 * Cash the two sides are apart for these terms (same non-cash items on the table), using both
 * private rule sets. > 0 means no cash amount can close it: the brand's max is below the creator's
 * minimum. Only the platform computes this; neither agent ever sees the number.
 */
export function cashGap(terms: Offer, brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx): number {
  const nonCash = { ...terms.package, cash_usd: 0 };
  const brandMaxCash = brandCap(brand) - valueForBrand(nonCash, brand);
  const creatorMinCash = creatorRequired(terms, creator, ctx.now) - valueForCreator(nonCash, terms, creator);
  return money(creatorMinCash - brandMaxCash);
}

/** No backwards moves: for the same deliverables and rights the brand only goes up, the creator only down. */
function checkMonotonic(offer: Offer, lastOwn: Offer | null, side: Side, where: string): void {
  if (!lastOwn || lastOwn.status === 'accept' || delivKey(lastOwn) !== delivKey(offer)) return;
  const prev = lastOwn.package.cash_usd;
  const cash = offer.package.cash_usd;
  if (side === 'brand' && cash < prev - 0.5) {
    throw new RuleViolation(`${where}: you already offered ${prev} cash for these deliverables. You cannot go lower. Hold at ${prev}, raise it, or change the deliverables.`);
  }
  if (side === 'creator' && cash > prev + 0.5) {
    throw new RuleViolation(`${where}: you already asked ${prev} cash for these deliverables. You cannot ask for more. Hold at ${prev}, lower it, or change the deliverables or rights.`);
  }
}

function engineSaysNoCrossing(side: Side, round: number, lastOpposing: Offer | null, brand: BrandProfile, creator: CreatorProfile): boolean {
  if (side !== 'brand' || !lastOpposing) return false;
  return creatorAtFloor(round, creator) && valueForBrand(lastOpposing.package, brand) > brandCap(brand);
}

/** Turn a validated proposal into the Offer that goes on the transcript, or throw RuleViolation. */
function referee(
  proposed: ProposedOffer, side: Side, round: number, lastOpposing: Offer | null, lastOwn: Offer | null,
  brand: BrandProfile, creator: CreatorProfile, ctx: NegotiationCtx,
): Offer {
  const where = `round ${round} ${side}`;
  if (proposed.status === 'accept') {
    if (!lastOpposing) throw new RuleViolation(`${where}: nothing to accept yet, make an offer`);
    const verdict = evaluate(lastOpposing, side, brand, creator, ctx);
    if (!verdict.accept) throw new RuleViolation(`${where}: you cannot accept this (${verdict.reason}). Counter with a package that works for you instead.`);
    return { ...lastOpposing, round, from: side, message: proposed.message, status: 'accept' };
  }
  if (proposed.status === 'walk_away') {
    if (round < MIN_WALK_ROUND && !engineSaysNoCrossing(side, round, lastOpposing, brand, creator)) {
      throw new RuleViolation(`${where}: too early to walk away (round ${round} < ${MIN_WALK_ROUND}). Counter instead.`);
    }
    const base = lastOpposing ?? { ...proposed, package: checkPackage(proposed.package, brand, where) };
    return { ...base, round, from: side, message: proposed.message, status: 'walk_away' };
  }
  const offer: Offer = {
    ...proposed,
    package: checkPackage(proposed.package, brand, where),
    round,
    from: side,
    status: lastOpposing ? 'counter' : 'offer',
  };
  checkHardTerms(offer, brand, creator, ctx, where);
  checkOwnRule(offer, side, brand, creator, ctx, where);
  checkMonotonic(offer, lastOwn, side, where);
  return offer;
}

export async function runNegotiationLLM(input: NegotiationInputLLM): Promise<NegotiationResultLLM> {
  const { brand, creator, brandNarrative, creatorNarrative, now, client, maxRounds } = input;
  const log = input.log ?? ((line: string) => { if (typeof process !== 'undefined' && process.stderr) process.stderr.write(line + '\n'); else console.log(line); });
  const ctx: NegotiationCtx = { now };
  const limit = Math.min(
    brand.private.concession_rules.max_rounds,
    creator.private.concession_rules.max_rounds,
    maxRounds ?? DEFAULT_MAX_ROUNDS,
    HARD_ROUND_LIMIT,
  );
  if (limit < 1) throw new Error(`runNegotiationLLM: round limit must be >= 1, got ${limit}`);

  const system: Record<Side, string> = {
    brand: buildBrandSystemPrompt({ brand, creator, brandNarrative, now }),
    creator: buildCreatorSystemPrompt({ brand, creator, creatorNarrative, now }),
  };
  const tool = proposeOfferTool(brand);
  const turns: Turn[] = [];
  let rule_violations = 0;
  let substitutions = 0;

  const push = (offer: Offer): Turn => {
    const turn: Turn = {
      ...offer,
      ts: new Date(now.getTime() + turns.length * 60_000).toISOString(),
      value_for_brand_usd: valueForBrand(offer.package, brand),
      value_for_creator_usd: valueForCreator(offer.package, offer, creator),
    };
    turns.push(turn);
    input.onTurn?.(turn);
    return turn;
  };

  /** One side's move: up to MAX_ATTEMPTS model calls with referee feedback, then the engine's deterministic offer. */
  const lastOwnOf = (side: Side): Offer | null => [...turns].reverse().find((t) => t.from === side) ?? null;

  const move = async (side: Side, round: number, lastOpposing: Offer | null): Promise<Offer> => {
    let content = buildTurnUserMessage({ side, round, history: turns, campaignName: brand.public.campaign.name, lastRound: limit });
    // Mediator hint: cash alone cannot close this, so trade on scope instead. No numbers leak.
    if (lastOpposing && round >= RESTRUCTURE_FROM_ROUND && cashGap(lastOpposing, brand, creator, ctx) > 0) {
      content += side === 'brand'
        ? '\n\nMediator note: at your limit, cash alone will not close this for these deliverables. Do not lower your cash. Restructure instead: offer fewer deliverables (for example stories only, or one reel without stories), or more product or affiliate, and say it plainly in one friendly sentence.'
        : '\n\nMediator note: the brand looks close to its limit for these deliverables. If you want this deal, offer a smaller scope at a price that still works for you (for example stories only), rather than holding the same ask.';
    }
    const messages: ChatCompletionMessageParam[] = [{ role: 'user', content }];
    const lastOwn = lastOwnOf(side);
    let lastText: string | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await proposeTurn({ client, side, round, system: system[side], messages, tool });
      lastText = res.text ?? lastText;
      const where = `round ${round} ${side}`;
      try {
        const proposed = parseProposed(res.input, where);
        const offer = referee(proposed, side, round, lastOpposing, lastOwn, brand, creator, ctx);
        log(`[llm] round ${round} ${side} attempt ${attempt}: cash=${offer.package.cash_usd} status=${offer.status} ${res.ms}ms ok`);
        return offer;
      } catch (err) {
        if (!(err instanceof RuleViolation)) throw err;
        rule_violations++;
        const cash = (res.input as { package?: { cash_usd?: unknown } } | null)?.package?.cash_usd;
        log(`[llm] round ${round} ${side} attempt ${attempt}: cash=${String(cash)} ${res.ms}ms REJECTED: ${err.message}`);
        messages.push(res.assistant, { role: 'tool', tool_call_id: res.toolCallId, content: `REJECTED. ${err.message} Call propose_offer again with a legal move.` });
      }
    }
    substitutions++;
    const engineOffer =
      side === 'brand'
        ? brandNextOffer(round, lastOpposing, brand, creator, ctx)
        : creatorNextOffer(round, lastOpposing, creator, brand, ctx);
    const offer = { ...engineOffer, message: lastText ?? engineOffer.message };
    log(`[llm] round ${round} ${side}: ${MAX_ATTEMPTS} rejected attempts, substituting engine offer cash=${offer.package.cash_usd}`);
    return offer;
  };

  // Like the engine, acceptedOffer is the offer that got accepted (the turn before the accept), not the accept turn.
  const finish = (offer: Offer, outcome: 'agreed' | 'walked_away', gap?: number): NegotiationResultLLM => {
    const accepted = outcome === 'agreed' ? turns[turns.length - 2] : undefined;
    return {
      turns,
      outcome,
      ...(accepted ? { acceptedOffer: toHistoryOffer(accepted) } : {}),
      rounds: offer.round,
      rule_violations,
      substitutions,
      ...(gap && gap > 0 ? { walk_reason: 'budget_gap' as const, gap_usd: Math.round(gap) } : {}),
    };
  };
  /** Gap on the last terms either side put on the table. */
  const gapNow = (): number => {
    const lastTerms = [...turns].reverse().find((t) => t.status === 'offer' || t.status === 'counter');
    return lastTerms ? cashGap(lastTerms, brand, creator, ctx) : 0;
  };

  let lastCreator: Offer | null = null;
  for (let round = 1; round <= limit; round++) {
    const brandOffer = push(await move('brand', round, lastCreator));
    if (brandOffer.status === 'accept') return finish(brandOffer, 'agreed');
    if (brandOffer.status === 'walk_away') return finish(brandOffer, 'walked_away', gapNow());

    const creatorOffer = push(await move('creator', round, brandOffer));
    if (creatorOffer.status === 'accept') return finish(creatorOffer, 'agreed');
    if (creatorOffer.status === 'walk_away') return finish(creatorOffer, 'walked_away', gapNow());
    lastCreator = creatorOffer;
  }

  const last = turns[turns.length - 1];
  if (!last) throw new Error('runNegotiationLLM: no turns produced');
  const gap = gapNow();
  // End on a question for the humans, not a door slam.
  const message = gap > 0
    ? `We're about $${Math.round(gap).toLocaleString('en-US')} apart on cash for ${describeDeliverables(last)}. Two ways to make it work: trim the deliverables, or raise the budget. Which one should we try?`
    : `We're close but not there after ${limit} rounds. Want us to try a smaller scope, or should each team take a look and come back?`;
  push({ ...last, from: 'brand', message, status: 'walk_away' });
  return finish(last, 'walked_away', gap);
}
