// Shared contract. Mirrors context/SCHEMA.md and the Creator/Offer/Deal contract in BRIEF.md.
// Do not edit from feature agents; report missing fields instead.

export type Side = 'brand' | 'creator';

export type ProductItem = { sku: string; retail_value_usd: number; qty: number };

export type Package = {
  cash_usd: number;
  product: ProductItem[];
  affiliate_pct: number;
  store_credit_usd: number;
  custom: string[];
};

export type DeliverableType = 'reel' | 'story' | 'post' | 'youtube_integration' | 'tiktok';
export type Deliverable = { type: DeliverableType; qty: number; notes?: string };

export type UsageRights = 'organic_only' | 'paid_ads_30d' | 'paid_ads_90d' | 'perpetual';
export type OfferStatus = 'offer' | 'counter' | 'accept' | 'reject' | 'walk_away';

export type Offer = {
  round: number;
  from: Side;
  package: Package;
  deliverables: Deliverable[];
  usage_rights: UsageRights;
  exclusivity: { category: string; days: number };
  deadline: string; // YYYY-MM-DD
  message: string;
  status: OfferStatus;
};

/** One transcript entry. Never contains private profile fields. */
export type Turn = Offer & {
  ts: string;
  value_for_brand_usd: number;
  value_for_creator_usd: number;
};

export type DealStatus =
  | 'negotiating' | 'agreed' | 'walked_away'
  | 'held' | 'live' | 'paid_out' | 'refunded';

export type Deal = {
  dealId: string;
  campaignId: string;
  brandSlug: string;
  creatorSlug: string;
  status: DealStatus;
  price: number;        // cash the brand pays via Stripe (package.cash_usd of the accepted offer)
  budgetLeft: number;
  acceptedOffer?: Offer;
  stripe?: { accountId?: string; paymentIntentId?: string; transferId?: string; refundId?: string };
  postUrl?: string;
  /** Market layer: set by POST /market/match. null/undefined = not evaluated yet. */
  selection?: 'selected' | 'not_selected' | null;
  /** 1 = best for that side among its own tentative deals. */
  ranks?: { brand: number; creator: number };
  createdAt: string;
  updatedAt: string;
};

/** What Raha's scraper produces. */
export type Creator = {
  handle: string;
  platform: 'instagram' | 'tiktok' | 'x' | 'linkedin' | 'youtube';
  followers: number;
  avgViews30d: number;
  engagement: number;   // 0.06 = 6%
  fairPrice: number;
};

// ---- profiles (context/<side>/<slug>/profile.json) ----

export type BrandProfile = {
  public: {
    name: string; site: string; category: string; hq: string;
    campaign: {
      name: string; goal: string;
      window: { start: string; end: string };
      wanted_deliverables: Deliverable[];
      target_audience: string;
    };
    brand_voice: string;
    content_guidelines: string[];
    no_gos: string[];
    barter_menu: {
      product: { sku: string; retail_value_usd: number; wholesale_cost_usd: number }[];
      affiliate_pct_range: [number, number];
      store_credit: boolean;
      custom: string[];
    };
  };
  private: {
    budget_total_usd: number;
    budget_per_creator_max_usd: number;
    target_cpm_usd: number;
    valuation: {
      product_counted_at: 'wholesale_cost' | 'retail';
      affiliate_expected_sales_usd_per_creator: number;
      store_credit_counted_at_pct: number;
      custom_counted_at_usd: Record<string, number>;
    };
    concession_rules: { first_offer_pct_of_max: number; step_pct: number; max_rounds: number; notes?: string };
    priorities: string[];
    walk_away_if: string[];
  };
};

export type CreatorProfile = {
  public: {
    name: string; handle: string; age?: number; location?: string;
    platforms: { name: string; followers: number; avg_views: number; engagement_pct: number }[];
    niche: string;
    audience: { age: string; gender_split: string; top_geos: string[] };
    rate_card: { reel: number; story: number; post: number; bundle_reel_3_stories: number };
    content_style: string;
    past_brand_deals: { brand: string; year: number; deliverables: string; terms: string; outcome: string }[];
    availability: { next_open_slot: string; slots_per_month: number; min_lead_time_days?: number; unsponsored_feed_share_pct_min?: number };
    barter_openness: { product: boolean; affiliate: boolean; store_credit: boolean; custom: string[] };
  };
  private: {
    floor_usd: { reel: number; story: number; post: number; bundle_reel_3_stories: number };
    valuation: {
      product_counted_at_pct_of_retail: number;
      product_only_if_she_would_wear_it?: boolean;
      affiliate_expected_sales_usd: number;
      affiliate_min_pct: number;
      affiliate_min_cookie_days: number;
      store_credit_counted_at_pct: number;
      custom_value_usd: Record<string, number>;
    };
    premiums: { paid_ads_30d_pct: number; paid_ads_90d_pct: number; perpetual_pct: number; exclusivity_per_30d_pct: number; rush_under_7d_pct: number };
    concession_rules: { first_ask_pct_over_floor: number; step_pct: number; max_rounds: number; notes?: string };
    stop_brands: string[];
    dealbreakers: string[];
    soft_preferences: string[];
    /** Brands the creator would go lower for: these floors replace floor_usd when the brand name matches. */
    preferred_brands?: { names: string[]; floor_usd: { reel: number; story: number; post: number; bundle_reel_3_stories: number } };
  };
};

export const emptyPackage = (): Package => ({ cash_usd: 0, product: [], affiliate_pct: 0, store_credit_usd: 0, custom: [] });

// ---- market layer (server/src/market/*) ----

export type BrandScore = { dealId: string; surplus_usd: number; value_usd: number; cap_usd: number; cash_usd: number; implied_cpm_usd: number | null };
export type CreatorScore = { dealId: string; surplus_usd: number; value_usd: number; required_usd: number; cash_usd: number };

export type MarketInput = {
  brands: { id: string; budget_usd: number; headcount: number; prefs: string[] }[];   // prefs = dealIds, best first
  creators: { id: string; slots: number; prefs: string[] }[];                         // prefs = dealIds, best first
  deals: { id: string; brandId: string; creatorId: string; cash_usd: number }[];
};
export type MarketResult = { selected: string[]; explain: Record<string, string> };
