// Concession: what each side puts on the table in a given round. Pure functions, deterministic.
import type { BrandProfile, CreatorProfile, Deliverable, Offer, Package, ProductItem } from '../types';
import { brandCap, cents, valueForBrand, valueForCreator, creatorRequired } from './valuation';

export type NegotiationCtx = { now: Date };

const DAY_MS = 86_400_000;
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const plural = (qty: number, type: string): string => (qty > 1 ? (type === 'story' ? 'stories' : `${type}s`) : type);
const money = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------- shared default terms ----------------

export function defaultDeliverables(brand: BrandProfile): Deliverable[] {
  const wanted = brand.public.campaign.wanted_deliverables.filter((d) => !/optional/i.test(d.notes ?? ''));
  if (wanted.length === 0) throw new Error(`defaultDeliverables: brand ${brand.public.name} wants nothing non-optional`);
  return wanted.map((d) => ({ type: d.type, qty: d.qty, ...(d.notes ? { notes: d.notes } : {}) }));
}

export function defaultTerms(brand: BrandProfile): Pick<Offer, 'deliverables' | 'usage_rights' | 'exclusivity' | 'deadline'> {
  const start = Date.parse(`${brand.public.campaign.window.start}T00:00:00Z`);
  if (Number.isNaN(start)) throw new Error(`defaultTerms: bad campaign window start "${brand.public.campaign.window.start}"`);
  const cat = brand.public.category.toLowerCase();
  return {
    deliverables: defaultDeliverables(brand),
    usage_rights: 'organic_only',
    exclusivity: { category: cat.includes('apparel') ? 'apparel' : cat, days: 30 },
    deadline: isoDate(new Date(start + 10 * DAY_MS)),
  };
}

// ---------------- brand ----------------

/** Share of cap the brand is willing to spend in `round` (first_offer + step per round, capped at 100). */
export function brandWillingnessPct(round: number, brand: BrandProfile): number {
  const r = brand.private.concession_rules;
  return Math.min(100, r.first_offer_pct_of_max + r.step_pct * (round - 1));
}

export function brandWillingness(round: number, brand: BrandProfile): number {
  return cents(brandCap(brand) * (brandWillingnessPct(round, brand) / 100));
}

function openingProducts(brand: BrandProfile): ProductItem[] {
  const menu = brand.public.barter_menu.product;
  if (menu.length === 0) return [];
  const hoodie = menu.find((p) => /hoodie/i.test(p.sku)) ?? menu[menu.length - 1];
  const tee =
    menu.find((p) => /re-spun/i.test(p.sku) && p.sku !== hoodie.sku) ??
    menu.find((p) => /tee/i.test(p.sku) && p.sku !== hoodie.sku) ??
    menu[0];
  const items: ProductItem[] = [{ sku: hoodie.sku, retail_value_usd: hoodie.retail_value_usd, qty: 2 }];
  if (tee.sku !== hoodie.sku) items.push({ sku: tee.sku, retail_value_usd: tee.retail_value_usd, qty: 1 });
  return items;
}

function affiliateForRound(round: number, brand: BrandProfile, creator: CreatorProfile): number {
  if (!creator.public.barter_openness.affiliate) return 0;
  const [lo, hi] = brand.public.barter_menu.affiliate_pct_range;
  const mid = Math.round((lo + hi) / 2);
  if (round <= 1) return mid;
  if (round === 2) return Math.min(hi, mid + 3);
  return hi;
}

/** Non-cash side of the brand's package for a round: product from round 1, custom items one per round from round 2, credit from round 3. */
function brandNonCash(round: number, brand: BrandProfile, creator: CreatorProfile): Omit<Package, 'cash_usd'> {
  const menu = brand.public.barter_menu;
  const custom = menu.custom.slice(0, Math.max(0, round - 1));
  const creditOk = menu.store_credit && creator.public.barter_openness.store_credit;
  return {
    product: creator.public.barter_openness.product ? openingProducts(brand) : [],
    affiliate_pct: affiliateForRound(round, brand, creator),
    store_credit_usd: creditOk && round >= 3 ? 250 : 0,
    custom,
  };
}

function describePackage(pkg: Package): string {
  const parts: string[] = [money(pkg.cash_usd) + ' cash'];
  for (const p of pkg.product) parts.push(`${p.qty}x ${p.sku}`);
  if (pkg.affiliate_pct > 0) parts.push(`${pkg.affiliate_pct}% affiliate`);
  if (pkg.store_credit_usd > 0) parts.push(`${money(pkg.store_credit_usd)} store credit`);
  for (const c of pkg.custom) parts.push(c);
  return parts.join(', ');
}

export function brandNextOffer(
  round: number,
  lastCreatorOffer: Offer | null,
  brand: BrandProfile,
  creator: CreatorProfile,
  ctx: NegotiationCtx,
): Offer {
  if (round < 1) throw new Error(`brandNextOffer: round must be >= 1, got ${round}`);
  void ctx;
  const terms = lastCreatorOffer
    ? { deliverables: lastCreatorOffer.deliverables, usage_rights: lastCreatorOffer.usage_rights, exclusivity: lastCreatorOffer.exclusivity, deadline: lastCreatorOffer.deadline }
    : defaultTerms(brand);
  const nonCash = brandNonCash(round, brand, creator);
  const nonCashValue = valueForBrand({ ...nonCash, cash_usd: 0 }, brand);
  const target = brandWillingness(round, brand);
  const pkg: Package = { ...nonCash, cash_usd: cents(Math.max(0, target - nonCashValue)) };

  const deliv = terms.deliverables.map((d) => `${d.qty} ${plural(d.qty, d.type)}`).join(' + ');
  const message =
    round === 1
      ? `Hi ${creator.public.name.split(' ')[0]}, we'd love ${deliv} for ${brand.public.campaign.name}. Opening offer: ${describePackage(pkg)}. Organic usage, ${terms.exclusivity.days}-day ${terms.exclusivity.category} exclusivity, due ${terms.deadline}.`
      : `We can move. Round ${round}: ${describePackage(pkg)}. Same deliverables and terms.`;

  return { round, from: 'brand', package: pkg, ...terms, message, status: round === 1 ? 'offer' : 'counter' };
}

// ---------------- creator ----------------

/** Multiplier over her floor for the creator's ask in `round` (first_ask down by step per round, never below 1). */
export function creatorAskMultiplier(round: number, creator: CreatorProfile): number {
  const r = creator.private.concession_rules;
  return 1 + Math.max(0, r.first_ask_pct_over_floor - r.step_pct * (round - 1)) / 100;
}

export function creatorAtFloor(round: number, creator: CreatorProfile): boolean {
  return creatorAskMultiplier(round, creator) === 1;
}

export function creatorNextOffer(
  round: number,
  lastBrandOffer: Offer | null,
  creator: CreatorProfile,
  brand: BrandProfile,
  ctx: NegotiationCtx,
): Offer {
  if (round < 1) throw new Error(`creatorNextOffer: round must be >= 1, got ${round}`);
  const terms = lastBrandOffer
    ? { deliverables: lastBrandOffer.deliverables, usage_rights: lastBrandOffer.usage_rights, exclusivity: lastBrandOffer.exclusivity, deadline: lastBrandOffer.deadline }
    : defaultTerms(brand);
  const ask = cents(creatorRequired(terms, creator, ctx.now) * creatorAskMultiplier(round, creator));

  // She keeps whatever non-cash the brand put on the table (valued her way) and asks for the gap in cash.
  const kept: Omit<Package, 'cash_usd'> = lastBrandOffer
    ? { product: lastBrandOffer.package.product, affiliate_pct: lastBrandOffer.package.affiliate_pct, store_credit_usd: lastBrandOffer.package.store_credit_usd, custom: lastBrandOffer.package.custom }
    : { product: [], affiliate_pct: 0, store_credit_usd: 0, custom: [] };
  const keptValue = valueForCreator({ ...kept, cash_usd: 0 }, terms, creator);
  const brandCash = lastBrandOffer?.package.cash_usd ?? 0;
  const pkg: Package = { ...kept, cash_usd: cents(Math.max(brandCash, ask - keptValue)) };

  const deliv = terms.deliverables.map((d) => `${d.qty} ${plural(d.qty, d.type)}`).join(' + ');
  const message = lastBrandOffer
    ? `Thanks, I like the ${brand.public.name} stuff and I'm in on the ${deliv}. That cash number is under where I land for these terms. I can do ${money(pkg.cash_usd)} cash, keeping the product${kept.affiliate_pct > 0 ? ` and the ${kept.affiliate_pct}% affiliate` : ''}${kept.custom.length ? ' and the extras' : ''}.`
    : `For ${deliv} with ${terms.exclusivity.days}-day ${terms.exclusivity.category} exclusivity my ask is ${money(pkg.cash_usd)} cash.`;

  return { round, from: 'creator', package: pkg, ...terms, message, status: lastBrandOffer ? 'counter' : 'offer' };
}
