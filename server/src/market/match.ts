// Market matching: many-to-many deferred acceptance (Gale-Shapley), brands proposing.
// Pure. Deterministic. No I/O.
import type { MarketInput, MarketResult } from '../types';

type DealIn = MarketInput['deals'][number];

type BrandState = { id: string; budget: number; headcount: number; prefs: string[]; held: Set<string>; spent: number };
type CreatorState = { id: string; slots: number; prefs: string[]; held: Set<string> };

const rank1 = (prefs: string[], dealId: string): number => prefs.indexOf(dealId) + 1; // 0 = absent
const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const rankList = (prefs: string[], ids: Iterable<string>): string => {
  const rs = [...ids].map((d) => rank1(prefs, d)).filter((r) => r > 0).sort((a, b) => a - b);
  return rs.length ? rs.map((r) => `#${r}`).join(',') : 'none';
};

/** 1-based ranks of a deal in its brand's and creator's prefs (0 = not listed). Handy for Deal.ranks. */
export function dealRanks(input: MarketInput, dealId: string): { brand: number; creator: number } | null {
  const d = input.deals.find((x) => x.id === dealId);
  if (!d) return null;
  const b = input.brands.find((x) => x.id === d.brandId);
  const c = input.creators.find((x) => x.id === d.creatorId);
  return { brand: b ? rank1(b.prefs, dealId) : 0, creator: c ? rank1(c.prefs, dealId) : 0 };
}

export function matchMarket(input: MarketInput): MarketResult {
  const deals = new Map<string, DealIn>();
  for (const d of input.deals) deals.set(d.id, d);
  const brands = new Map<string, BrandState>();
  for (const b of input.brands) brands.set(b.id, { id: b.id, budget: b.budget_usd, headcount: b.headcount, prefs: b.prefs, held: new Set(), spent: 0 });
  const creators = new Map<string, CreatorState>();
  for (const c of input.creators) creators.set(c.id, { id: c.id, slots: c.slots, prefs: c.prefs, held: new Set() });

  const explain: Record<string, string> = {};
  const rejected = new Set<string>(); // permanent: creators only ever tighten their held set

  // Deals that can never be proposed.
  const proposable = new Set<string>();
  for (const d of input.deals) {
    const b = brands.get(d.brandId);
    const c = creators.get(d.creatorId);
    if (!b) explain[d.id] = `invalid: unknown brand "${d.brandId}"`;
    else if (!c) explain[d.id] = `invalid: unknown creator "${d.creatorId}"`;
    else if (rank1(b.prefs, d.id) === 0) explain[d.id] = 'not proposed: brand has no preference for this deal';
    else proposable.add(d.id);
  }

  const maxIter = Math.max(10, input.deals.length * 10);
  let iter = 0;
  for (;;) {
    if (++iter > maxIter) throw new Error(`matchMarket: exceeded ${maxIter} iterations (deals=${input.deals.length})`);
    let proposed = false;
    for (const b of brands.values()) {
      for (const dealId of b.prefs) {
        const d = deals.get(dealId);
        if (!d || !proposable.has(dealId) || d.brandId !== b.id) continue;
        if (b.held.has(dealId) || rejected.has(dealId)) continue;
        if (b.held.size >= b.headcount) { explain[dealId] = `not proposed: brand headcount reached (${b.held.size}/${b.headcount})`; continue; }
        if (b.spent + d.cash_usd > b.budget) {
          explain[dealId] = `skipped: budget (would exceed ${fmt(b.budget)} by ${fmt(b.spent + d.cash_usd - b.budget)})`;
          continue;
        }
        proposed = true;
        const c = creators.get(d.creatorId)!;
        if (rank1(c.prefs, dealId) === 0) {
          rejected.add(dealId);
          explain[dealId] = 'rejected by creator: creator has no preference for this deal';
          continue;
        }
        // Creator keeps the best `slots` among held + new, by her prefs.
        const pool = [...c.held, dealId].sort((x, y) => rank1(c.prefs, x) - rank1(c.prefs, y));
        const keep = pool.slice(0, Math.max(0, c.slots));
        const drop = pool.slice(Math.max(0, c.slots));
        c.held = new Set(keep);
        if (keep.includes(dealId)) { b.held.add(dealId); b.spent += d.cash_usd; }
        for (const lost of drop) {
          rejected.add(lost);
          const ld = deals.get(lost)!;
          const lb = brands.get(ld.brandId)!;
          if (lb.held.delete(lost)) lb.spent -= ld.cash_usd;
          explain[lost] = `rejected by creator: slots full (kept ${rankList(c.prefs, keep)})`;
        }
      }
    }
    if (!proposed) break;
  }

  const selected: string[] = [];
  for (const d of input.deals) {
    const b = brands.get(d.brandId);
    const c = creators.get(d.creatorId);
    if (b && c && b.held.has(d.id) && c.held.has(d.id)) {
      selected.push(d.id);
      explain[d.id] = `selected: #${rank1(b.prefs, d.id)} for brand, #${rank1(c.prefs, d.id)} for creator`;
    } else if (!explain[d.id]) {
      explain[d.id] = 'not proposed';
    }
  }
  return { selected, explain };
}

/**
 * A blocking pair is an unselected deal (b, c) such that:
 *  - b would take it: b has free headcount+budget, or holds a deal it ranks below this one whose swap-out fits the budget;
 *  - c would take it: c has a free slot, or holds a deal she ranks below this one.
 */
export function isStable(input: MarketInput, result: MarketResult): { stable: boolean; blockingPairs: string[] } {
  const sel = new Set(result.selected);
  const deals = new Map(input.deals.map((d) => [d.id, d] as const));
  const blocking: string[] = [];
  for (const d of input.deals) {
    if (sel.has(d.id)) continue;
    const b = input.brands.find((x) => x.id === d.brandId);
    const c = input.creators.find((x) => x.id === d.creatorId);
    if (!b || !c) continue;
    const rb = rank1(b.prefs, d.id);
    const rc = rank1(c.prefs, d.id);
    if (rb === 0 || rc === 0) continue;

    const bHeld = input.deals.filter((x) => x.brandId === b.id && sel.has(x.id));
    const spent = bHeld.reduce((s, x) => s + x.cash_usd, 0);
    let brandWants = bHeld.length < b.headcount && spent + d.cash_usd <= b.budget_usd;
    if (!brandWants) {
      brandWants = bHeld.some((h) => rank1(b.prefs, h.id) > rb && spent - h.cash_usd + d.cash_usd <= b.budget_usd);
    }
    if (!brandWants) continue;

    const cHeld = input.deals.filter((x) => x.creatorId === c.id && sel.has(x.id));
    const creatorWants = cHeld.length < c.slots || cHeld.some((h) => rank1(c.prefs, h.id) > rc);
    if (!creatorWants) continue;

    void deals;
    blocking.push(d.id);
  }
  return { stable: blocking.length === 0, blockingPairs: blocking };
}
