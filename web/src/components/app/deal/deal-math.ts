import { Film01, Film02, Image01, Phone01, VideoRecorder } from "@untitledui/icons";
import type { ServerDeliverable, ServerPackage } from "@/lib/deals/api";

/** Price of one deliverable relative to one reel. Same ratios the server rate card uses. */
export const RATIO: Record<string, number> = {
  reel: 1,
  story: 0.16,
  post: 0.43,
  tiktok: 1,
  youtube_integration: 1.5,
};

export const DELIVERABLE_ICON: Record<string, typeof Film01> = {
  reel: Film01,
  story: Phone01,
  post: Image01,
  tiktok: Film02,
  youtube_integration: VideoRecorder,
};

const NAMES: Record<string, [string, string]> = {
  reel: ["Reel", "Reels"],
  story: ["Story", "Stories"],
  post: ["Post", "Posts"],
  tiktok: ["TikTok", "TikToks"],
  youtube_integration: ["YouTube integration", "YouTube integrations"],
};

export function deliverableLabel(d: ServerDeliverable, lower = false) {
  const [one, many] = NAMES[d.type] ?? [d.type, `${d.type}s`];
  const name = d.qty === 1 ? one : many;
  return `${d.qty} ${lower ? name.toLowerCase() : name}`;
}

export const describeDeliverables = (ds: ServerDeliverable[]) => (ds.length ? ds.map((d) => deliverableLabel(d, true)).join(" + ") : "1 reel");

const weight = (d: ServerDeliverable) => (RATIO[d.type] ?? 1) * d.qty;

/** Fair cash for a set of deliverables, given the fair price of ONE reel. */
export function fairFor(ds: ServerDeliverable[], fairReel: number) {
  if (!ds.length) return fairReel;
  return Math.round(ds.reduce((sum, d) => sum + fairReel * weight(d), 0));
}

/** Split cash across deliverables by their rate-card weight. */
export function cashShares(ds: ServerDeliverable[], cash: number) {
  const total = ds.reduce((s, d) => s + weight(d), 0) || 1;
  return ds.map((d) => Math.round((cash * weight(d)) / total));
}

export type Mix = {
  cash: number;
  products: number;
  affiliate: number;
  perks: number;
};

/** What a package is made of in dollars. Affiliate is estimated from the creator's valuation when it is known. */
export function packageMix(p: ServerPackage, valueForCreator?: number): Mix {
  const products = p.product.reduce((s, x) => s + x.retail_value_usd * x.qty, 0);
  const perks = p.store_credit_usd;
  const rest = valueForCreator !== undefined ? valueForCreator - p.cash_usd - products - perks : 0;
  const affiliate = p.affiliate_pct > 0 ? Math.max(0, Math.round(rest)) : 0;
  return { cash: p.cash_usd, products: Math.round(products), affiliate, perks };
}
