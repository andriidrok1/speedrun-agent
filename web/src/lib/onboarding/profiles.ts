// Onboarding forms -> profiles in the context/SCHEMA.md shape the deals server negotiates with.
// Public fields are shown to the other side's agent; private fields only ever reach your own agent.
import type { BrandProfile, CreatorProfile } from "@server/types";
import type { Creator } from "@shared/contract";

const DAY = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

// ---------------- creator ----------------

export interface CreatorForm {
  handle: string; // without @
  name: string;
  niche: string;
  voice: string;
  /** Private: the lowest you accept, per deliverable. */
  minReel: number;
  minStory: number;
  minPost: number;
  /** Public rate card: what you ask for. */
  idealReel: number;
  idealStory: number;
  idealPost: number;
  openToProducts: boolean;
  openToAffiliate: boolean;
  refuses: string; // categories / brands, comma or newline separated
  dealbreakers: string;
  /** Private: brands you would go lower for, comma separated ("" = none). */
  favoriteBrands: string;
  /** Private: the lowest you accept from a favorite brand (0 = use the normal minimum). */
  favoriteMinReel: number;
  favoriteMinStory: number;
  favoriteMinPost: number;
}

export function creatorFormDefaults(c?: Creator): CreatorForm {
  const fair = c?.fairPrice ?? 800;
  const r = (x: number) => Math.max(1, Math.round(x));
  return {
    handle: c?.handle.replace("@", "") ?? "",
    name: c?.name ?? "",
    niche: c?.niche ?? "lifestyle",
    voice: "Friendly and direct. I only promote things I actually use.",
    minReel: r(fair * 0.8),
    minStory: r(fair * 0.15),
    minPost: r(fair * 0.35),
    idealReel: r(fair * 1.1),
    idealStory: r(fair * 0.2),
    idealPost: r(fair * 0.45),
    openToProducts: true,
    openToAffiliate: true,
    refuses: "gambling, crypto",
    dealbreakers: "perpetual usage rights",
    favoriteBrands: "",
    favoriteMinReel: 0,
    favoriteMinStory: 0,
    favoriteMinPost: 0,
  };
}

export function buildCreatorProfile(f: CreatorForm, scraped?: Creator): CreatorProfile {
  const bundleMin = f.minReel + 3 * f.minStory;
  const bundleIdeal = f.idealReel + 3 * f.idealStory;
  const favorites = lines(f.favoriteBrands ?? "");
  const fav = (x: number | undefined, normal: number) => (x && x > 0 ? x : normal);
  const favFloor = { reel: fav(f.favoriteMinReel, f.minReel), story: fav(f.favoriteMinStory, f.minStory), post: fav(f.favoriteMinPost, f.minPost) };
  return {
    public: {
      name: f.name || f.handle,
      handle: `@${f.handle}`,
      platforms: [
        {
          name: scraped?.platform ?? "instagram",
          followers: scraped?.followers ?? 0,
          avg_views: scraped?.avgViews30d ?? 0,
          engagement_pct: Number(((scraped?.engagement ?? 0) * 100).toFixed(2)),
        },
      ],
      niche: f.niche,
      audience: { age: "unknown", gender_split: "unknown", top_geos: [] },
      rate_card: { reel: f.idealReel, story: f.idealStory, post: f.idealPost, bundle_reel_3_stories: bundleIdeal },
      content_style: f.voice,
      past_brand_deals: [],
      availability: { next_open_slot: isoDay(5), slots_per_month: 4, min_lead_time_days: 5 },
      barter_openness: { product: f.openToProducts, affiliate: f.openToAffiliate, store_credit: false, custom: [] },
    },
    private: {
      floor_usd: { reel: f.minReel, story: f.minStory, post: f.minPost, bundle_reel_3_stories: bundleMin },
      valuation: {
        product_counted_at_pct_of_retail: 50,
        affiliate_expected_sales_usd: Math.round(f.idealReel * 0.6),
        affiliate_min_pct: 15,
        affiliate_min_cookie_days: 30,
        store_credit_counted_at_pct: 50,
        custom_value_usd: {},
      },
      premiums: { paid_ads_30d_pct: 30, paid_ads_90d_pct: 60, perpetual_pct: 120, exclusivity_per_30d_pct: 15, rush_under_7d_pct: 25 },
      concession_rules: {
        // Open at the ideal price, give ground toward the minimum over the rounds.
        first_ask_pct_over_floor: clamp(Math.round((bundleIdeal / Math.max(1, bundleMin) - 1) * 100), 10, 60),
        step_pct: 8,
        max_rounds: 5,
      },
      stop_brands: lines(f.refuses),
      dealbreakers: lines(f.dealbreakers),
      soft_preferences: favorites.length ? [`Loves working with ${favorites.join(", ")}; will go lower for them`] : [],
      ...(favorites.length
        ? { preferred_brands: { names: favorites, floor_usd: { ...favFloor, bundle_reel_3_stories: favFloor.reel + 3 * favFloor.story } } }
        : {}),
    },
  };
}

// ---------------- brand ----------------

export interface BrandForm {
  name: string;
  site: string;
  category: string;
  campaignName: string;
  goal: string;
  audience: string;
  voice: string;
  creators: number;
  /** Private budget rules. */
  totalBudget: number;
  maxPerCreator: number;
  startingOffer: number;
  reels: number;
  stories: number;
  /** Things to offer besides cash: one per line, "Name, retail price, your cost". */
  products: string;
  affiliateMin: number;
  affiliateMax: number;
  perks: string;
  noGos: string;
}

export const brandFormDefaults: BrandForm = {
  name: "",
  site: "",
  category: "apparel",
  campaignName: "Fall launch",
  goal: "Drive sales of the new collection",
  audience: "US, 18 to 34",
  voice: "Warm, casual, never salesy.",
  creators: 5,
  totalBudget: 10_000,
  maxPerCreator: 2_500,
  startingOffer: 1_200,
  reels: 1,
  stories: 3,
  products: "Signature hoodie, 120, 35",
  affiliateMin: 10,
  affiliateMax: 20,
  perks: "Invite to launch event",
  noGos: "No competitor mentions",
};

export function parseProducts(s: string): { sku: string; retail_value_usd: number; wholesale_cost_usd: number }[] {
  return s
    .split("\n")
    .map((l) => l.split(",").map((x) => x.trim()))
    .filter((p) => p[0] && Number(p[1]) > 0)
    .map(([sku, retail, cost]) => ({
      sku,
      retail_value_usd: Number(retail),
      wholesale_cost_usd: Number(cost) > 0 ? Number(cost) : Math.round(Number(retail) * 0.35),
    }));
}

export function buildBrandProfile(f: BrandForm): BrandProfile {
  const perks = lines(f.perks);
  const wanted = [
    ...(f.reels > 0 ? [{ type: "reel" as const, qty: f.reels }] : []),
    ...(f.stories > 0 ? [{ type: "story" as const, qty: f.stories }] : []),
  ];
  const firstPct = clamp(Math.round((f.startingOffer / Math.max(1, f.maxPerCreator)) * 100), 25, 90);
  return {
    public: {
      name: f.name,
      site: f.site,
      category: f.category,
      hq: "",
      campaign: {
        name: f.campaignName,
        goal: f.goal,
        window: { start: isoDay(7), end: isoDay(37) },
        wanted_deliverables: wanted.length ? wanted : [{ type: "reel", qty: 1 }],
        target_audience: f.audience,
      },
      brand_voice: f.voice,
      content_guidelines: [],
      no_gos: lines(f.noGos),
      barter_menu: {
        product: parseProducts(f.products),
        affiliate_pct_range: [f.affiliateMin, Math.max(f.affiliateMin, f.affiliateMax)],
        store_credit: false,
        custom: perks,
      },
    },
    private: {
      budget_total_usd: f.totalBudget,
      budget_per_creator_max_usd: f.maxPerCreator,
      target_cpm_usd: 20,
      valuation: {
        product_counted_at: "wholesale_cost",
        affiliate_expected_sales_usd_per_creator: Math.round(f.maxPerCreator * 0.5),
        store_credit_counted_at_pct: 50,
        custom_counted_at_usd: Object.fromEntries(perks.map((p) => [p, 50])),
      },
      // Open at the starting offer, reach the max per creator by the last round.
      concession_rules: { first_offer_pct_of_max: firstPct, step_pct: Math.ceil((100 - firstPct) / 4), max_rounds: 5 },
      priorities: [f.goal],
      walk_away_if: lines(f.noGos),
    },
  };
}
