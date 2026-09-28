// The contract between the web app (Raha) and the deals server (Andrii).
// Shapes come from BRIEF.md. Tell the other side before changing a required field.

export type Platform = "instagram" | "tiktok";

export interface Creator {
  handle: string; // "@fitjane"
  platform: Platform;
  followers: number;
  avgViews30d: number;
  engagement: number; // 0.06 = 6%
  fairPrice: number; // USD per post
  // Optional extras from the web side, safe to ignore
  name?: string;
  avatarUrl?: string;
  niche?: string;
  posts30d?: number;
  scrapedAt?: string; // ISO date
}

export interface Offer {
  dealId: string;
  from: "brand" | "creator";
  amount: number;
  message: string;
}

// Statuses the deals server emits (docs/api-integration.md). `held` = brand paid, money held;
// `paid_out` = post verified, creator paid.
export type DealStatus =
  | "negotiating"
  | "agreed"
  | "held"
  | "paid_out"
  | "refunded"
  | "walked_away";

export interface Deal {
  dealId: string;
  status: DealStatus;
  price: number;
  budgetLeft: number;
}
