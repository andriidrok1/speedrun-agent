// Valuation: convert a Package into one USD number per side, using that side's private rules.
// Pure functions. No I/O.
import type { BrandProfile, CreatorProfile, Deliverable, Offer, Package } from '../types';

export const cents = (n: number): number => Math.round(n * 100) / 100;

export type OfferTerms = Pick<Offer, 'usage_rights' | 'exclusivity' | 'deadline' | 'deliverables'>;

const DAY_MS = 86_400_000;

/** Days from `now` to a YYYY-MM-DD deadline (UTC midnight), fractional. */
export function daysUntil(deadline: string, now: Date): number {
  const d = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(d)) throw new Error(`daysUntil: bad deadline "${deadline}"`);
  return (d - now.getTime()) / DAY_MS;
}

// ---------------- brand side ----------------

export function valueForBrand(pkg: Package, brand: BrandProfile): number {
  const menu = brand.public.barter_menu;
  const val = brand.private.valuation;
  let v = pkg.cash_usd;

  for (const item of pkg.product) {
    const m = menu.product.find((p) => p.sku === item.sku);
    if (!m) throw new Error(`valueForBrand: unknown sku "${item.sku}" (brand ${brand.public.name})`);
    const unit = val.product_counted_at === 'retail' ? m.retail_value_usd : m.wholesale_cost_usd;
    v += unit * item.qty;
  }
  v += pkg.store_credit_usd * (val.store_credit_counted_at_pct / 100);
  v += (pkg.affiliate_pct / 100) * val.affiliate_expected_sales_usd_per_creator;
  for (const c of pkg.custom) v += val.custom_counted_at_usd[c] ?? 0;

  return cents(v);
}

export function brandCap(brand: BrandProfile): number {
  return brand.private.budget_per_creator_max_usd;
}

// ---------------- creator side ----------------

const STOP = new Set(['with', 'from', 'that', 'this', 'they', 'them', 'some', 'into', 'than', 'will', 'your', 'season', 'stories']);
const tokens = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t));

/** Map a brand's custom item label to the creator's custom_value_usd key. Substring first, then keyword overlap. */
export function matchCustom(label: string, creator: CreatorProfile): string | undefined {
  const keys = Object.keys(creator.private.valuation.custom_value_usd);
  const l = label.toLowerCase();
  const direct = keys.find((k) => l.includes(k.toLowerCase()) || k.toLowerCase().includes(l));
  if (direct) return direct;
  const lt = new Set(tokens(label));
  let best: string | undefined;
  let bestScore = 0;
  for (const k of keys) {
    const score = tokens(k).filter((t) => lt.has(t)).length;
    if (score > bestScore) { best = k; bestScore = score; }
  }
  return best;
}

export function valueForCreator(pkg: Package, offer: OfferTerms, creator: CreatorProfile): number {
  const val = creator.private.valuation;
  const open = creator.public.barter_openness;
  let v = pkg.cash_usd;

  if (open.product) {
    for (const item of pkg.product) v += item.retail_value_usd * item.qty * (val.product_counted_at_pct_of_retail / 100);
  }
  if (open.store_credit) v += pkg.store_credit_usd * (val.store_credit_counted_at_pct / 100);
  if (open.affiliate && pkg.affiliate_pct >= val.affiliate_min_pct) {
    v += (pkg.affiliate_pct / 100) * val.affiliate_expected_sales_usd;
  }
  for (const c of pkg.custom) {
    const key = matchCustom(c, creator);
    if (key) v += val.custom_value_usd[key];
  }
  void offer; // terms affect the floor (creatorRequired), not the package value
  return cents(v);
}

/** Base floor for the deliverables list before premiums. */
export function deliverablesFloor(deliverables: Deliverable[], creator: CreatorProfile): number {
  const f = creator.private.floor_usd;
  const qty = (t: Deliverable['type']) => deliverables.filter((d) => d.type === t).reduce((s, d) => s + d.qty, 0);
  const isBundle =
    deliverables.every((d) => d.type === 'reel' || d.type === 'story') && qty('reel') === 1 && qty('story') === 3;
  if (isBundle) return f.bundle_reel_3_stories;

  let total = 0;
  for (const d of deliverables) {
    switch (d.type) {
      case 'reel': total += f.reel * d.qty; break;
      case 'story': total += f.story * d.qty; break;
      case 'post': total += f.post * d.qty; break;
      case 'tiktok': total += f.reel * d.qty; break;
      case 'youtube_integration': total += 2 * f.reel * d.qty; break;
      default: throw new Error(`deliverablesFloor: unknown deliverable type "${(d as Deliverable).type}"`);
    }
  }
  return total;
}

/** Premium percentage (additive) for usage rights, exclusivity (per 30 days, prorated) and rush. */
export function premiumPct(offer: OfferTerms, creator: CreatorProfile, now: Date): number {
  const p = creator.private.premiums;
  let pct = 0;
  switch (offer.usage_rights) {
    case 'organic_only': break;
    case 'paid_ads_30d': pct += p.paid_ads_30d_pct; break;
    case 'paid_ads_90d': pct += p.paid_ads_90d_pct; break;
    case 'perpetual': pct += p.perpetual_pct; break;
    default: throw new Error(`premiumPct: unknown usage_rights "${offer.usage_rights}"`);
  }
  if (offer.exclusivity.days > 0) pct += (offer.exclusivity.days / 30) * p.exclusivity_per_30d_pct;
  if (daysUntil(offer.deadline, now) < 7) pct += p.rush_under_7d_pct;
  return pct;
}

/** The minimum value (in her own USD) the creator needs to say yes to these terms. */
export function creatorRequired(offer: OfferTerms, creator: CreatorProfile, now: Date): number {
  const base = deliverablesFloor(offer.deliverables, creator);
  return cents(base * (1 + premiumPct(offer, creator, now) / 100));
}
