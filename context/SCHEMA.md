# Context files: schema

Each party (brand, creator) has two files:

- `profile.md`: narrative the agent reads as system context. Who they are, what they want, how they talk, red lines, past deals.
- `profile.json`: structured fields the negotiation engine uses. Split into `public` (the other side may see) and `private` (never revealed, used for accept/reject/counter).

## Currency of a deal

An offer is not only cash. A deal `package` can mix:

- `cash_usd`: number
- `product`: [{ sku, retail_value_usd, qty }]  (goods OR services: a hoodie, a haircut, a photo shoot, a gym membership; anything with a retail price and a cost to the brand)
- `affiliate_pct`: commission % on tracked sales
- `store_credit_usd`: number
- `custom`: free-form (event invite, co-branded drop, early access, feature on brand channels)

Both sides convert a package to a single `value_usd` using their own `valuation` rules in `private`. Same package, different value to each side. That asymmetry is where deals happen.

## Offer object (what agents exchange)

```json
{
  "round": 1,
  "from": "brand" | "creator",
  "package": { "cash_usd": 0, "product": [], "affiliate_pct": 0, "store_credit_usd": 0, "custom": [] },
  "deliverables": [{ "type": "reel" | "story" | "post" | "youtube_integration" | "tiktok", "qty": 1, "notes": "" }],
  "usage_rights": "organic_only" | "paid_ads_30d" | "paid_ads_90d" | "perpetual",
  "exclusivity": { "category": "apparel", "days": 0 },
  "deadline": "YYYY-MM-DD",
  "message": "one paragraph, in the party's voice",
  "status": "offer" | "counter" | "accept" | "reject" | "walk_away"
}
```

## brand/profile.json

```json
{
  "public": {
    "name": "", "site": "", "category": "", "hq": "",
    "campaign": { "name": "", "goal": "", "window": { "start": "", "end": "" }, "wanted_deliverables": [], "target_audience": "" },
    "brand_voice": "", "content_guidelines": [], "no_gos": [],
    "barter_menu": { "product": [{ "sku": "", "retail_value_usd": 0, "wholesale_cost_usd": 0 }], "affiliate_pct_range": [0, 0], "store_credit": true, "custom": [] }
  },
  "private": {
    "budget_total_usd": 0,
    "budget_per_creator_max_usd": 0,
    "target_cpm_usd": 0,
    "valuation": { "product_counted_at": "wholesale_cost", "affiliate_expected_sales_usd_per_creator": 0, "store_credit_counted_at_pct": 0 },
    "concession_rules": { "first_offer_pct_of_max": 0, "step_pct": 0, "max_rounds": 6 },
    "priorities": [], "walk_away_if": []
  }
}
```

## creator/profile.json

```json
{
  "public": {
    "name": "", "handle": "", "platforms": [{ "name": "", "followers": 0, "avg_views": 0, "engagement_pct": 0 }],
    "niche": "", "audience": { "age": "", "gender_split": "", "top_geos": [] },
    "rate_card": { "reel": 0, "story": 0, "post": 0, "bundle_reel_3_stories": 0 },
    "content_style": "", "past_brand_deals": [], "availability": { "next_open_slot": "", "slots_per_month": 0 },
    "barter_openness": { "product": true, "affiliate": true, "store_credit": false, "custom": [] }
  },
  "private": {
    "floor_usd": { "reel": 0, "story": 0, "bundle_reel_3_stories": 0 },
    "valuation": { "product_counted_at_pct_of_retail": 0, "affiliate_expected_sales_usd": 0, "store_credit_counted_at_pct": 0 },
    "premiums": { "paid_ads_30d_pct": 0, "paid_ads_90d_pct": 0, "perpetual_pct": 0, "exclusivity_per_30d_pct": 0, "rush_under_7d_pct": 0 },
    "concession_rules": { "first_ask_pct_over_floor": 0, "step_pct": 0, "max_rounds": 6 },
    "stop_brands": [], "dealbreakers": [], "soft_preferences": []
  }
}
```

Numbers must be realistic for 2026 US creator market. Cite the source in profile.md when a public fact is used.
