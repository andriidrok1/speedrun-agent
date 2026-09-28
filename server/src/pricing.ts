// Pricing guards shared by the engine and LLM paths. Pure functions, no I/O.
import type { BrandProfile, Creator, CreatorProfile } from './types';

/** How far the brand may go over the creator's own rate card (BRIEF.md: +/- 30% flex). */
export const BRAND_FLEX = 1.3;

/**
 * The brand's per-creator cap for this deal: never more than 1.3x what the creator's bundle is worth
 * on their real numbers. Without this every creator is offered a share of the brand's global max,
 * so a 600-view account and a 200k-view account got the same price.
 */
export function brandForCreator(brand: BrandProfile, creator: CreatorProfile): BrandProfile {
  const bundle = creator.public.rate_card.bundle_reel_3_stories;
  const cap = Math.min(brand.private.budget_per_creator_max_usd, Math.round(bundle * BRAND_FLEX));
  if (cap === brand.private.budget_per_creator_max_usd) return brand;
  // Affiliate value scales with reach too: the brand's expected sales assume a typical creator at its max.
  const scale = cap / brand.private.budget_per_creator_max_usd;
  return {
    ...brand,
    private: {
      ...brand.private,
      budget_per_creator_max_usd: cap,
      valuation: {
        ...brand.private.valuation,
        affiliate_expected_sales_usd_per_creator: Math.round(brand.private.valuation.affiliate_expected_sales_usd_per_creator * scale),
      },
    },
  };
}

/**
 * A creator's favorite brands get the creator's lower "favorite" floors for that deal only.
 * Match is case-insensitive on the brand name (either contains the other), e.g. "OpenAI" vs "OpenAI Inc".
 */
export function creatorForBrand(creator: CreatorProfile, brand: BrandProfile): CreatorProfile {
  const pref = creator.private.preferred_brands;
  if (!pref?.names.length) return creator;
  const name = brand.public.name.toLowerCase().trim();
  const hit = pref.names.some((n) => {
    const x = n.toLowerCase().trim();
    return x.length > 1 && (name.includes(x) || x.includes(name));
  });
  if (!hit) return creator;
  return { ...creator, private: { ...creator.private, floor_usd: pref.floor_usd } };
}

// Common ways a brand describes a category a creator refuses.
const SYNONYMS: Record<string, string[]> = {
  gambling: ['casino', 'betting', 'bet ', 'poker', 'slots', 'sportsbook', 'lottery'],
  crypto: ['bitcoin', 'blockchain', 'web3', 'nft', 'token', 'defi', 'coin'],
  alcohol: ['beer', 'wine', 'liquor', 'vodka', 'whiskey', 'spirits'],
  vaping: ['vape', 'e-cig', 'nicotine'],
  tobacco: ['cigarette', 'nicotine'],
  cheating: ['cheat'],
};
const stem = (w: string) => w.slice(0, Math.max(4, w.length - 3));

/**
 * Should these two even talk? Checks the creator's public and private refusals against how the brand
 * describes itself. A mismatch means no conversation starts; both sides see the reason instead.
 */
export function fitCheck(brand: BrandProfile, creator: CreatorProfile): { fit: boolean; reasons: string[] } {
  const about = [
    brand.public.name, brand.public.category, brand.public.site, brand.public.campaign.name,
    brand.public.campaign.goal, brand.public.campaign.target_audience,
  ].join(' ').toLowerCase();
  const refusals = [...(creator.public.refuses ?? []), ...creator.private.stop_brands].map((r) => r.toLowerCase().trim()).filter(Boolean);
  const reasons: string[] = [];
  for (const r of new Set(refusals)) {
    const words = r.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const terms = [r, ...words.map(stem), ...words.flatMap((w) => SYNONYMS[w] ?? [])];
    if (terms.some((t) => t.length >= 3 && about.includes(t))) {
      reasons.push(`${creator.public.handle} does not work with ${r}, and ${brand.public.name} is ${brand.public.category}.`);
    }
  }
  return { fit: reasons.length === 0, reasons };
}

/** Minimal CreatorProfile from Raha's scraper output, priced around fairPrice. */
export function profileFromScraped(slug: string, c: Creator): CreatorProfile {
  const fair = Math.max(1, Math.round(c.fairPrice));
  const floor = Math.round(fair * 0.75);
  const rate = (k: number) => Math.round(fair * k);
  return {
    public: {
      name: slug,
      handle: c.handle,
      platforms: [{ name: c.platform, followers: c.followers, avg_views: c.avgViews30d, engagement_pct: c.engagement * 100 }],
      niche: 'unknown (scraped profile)',
      audience: { age: 'unknown', gender_split: 'unknown', top_geos: [] },
      rate_card: { reel: rate(1), story: rate(0.16), post: rate(0.43), bundle_reel_3_stories: rate(1.4) },
      content_style: 'unknown',
      past_brand_deals: [],
      availability: { next_open_slot: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10), slots_per_month: 3, min_lead_time_days: 7 },
      barter_openness: { product: true, affiliate: true, store_credit: false, custom: [] },
    },
    private: {
      floor_usd: { reel: floor, story: Math.round(floor * 0.16), post: Math.round(floor * 0.43), bundle_reel_3_stories: Math.round(floor * 1.4) },
      valuation: {
        product_counted_at_pct_of_retail: 50,
        affiliate_expected_sales_usd: Math.round(fair * 0.6),
        affiliate_min_pct: 15,
        affiliate_min_cookie_days: 30,
        store_credit_counted_at_pct: 50,
        custom_value_usd: {},
      },
      premiums: { paid_ads_30d_pct: 30, paid_ads_90d_pct: 60, perpetual_pct: 120, exclusivity_per_30d_pct: 15, rush_under_7d_pct: 25 },
      concession_rules: { first_ask_pct_over_floor: 35, step_pct: 10, max_rounds: 6 },
      stop_brands: [],
      dealbreakers: [],
      soft_preferences: [],
    },
  };
}
