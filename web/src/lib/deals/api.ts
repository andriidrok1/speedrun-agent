// Client for the deals server (server/README.md). Local: `cd server && npx wrangler dev --port 8787`.
import type { BrandProfile, CreatorProfile } from "@server/types";
import type { Creator, DealStatus } from "@shared/contract";

export const API = process.env.NEXT_PUBLIC_DEALS_API ?? "http://localhost:8787";

export type ServerPackage = {
  cash_usd: number;
  product: { sku: string; qty: number; retail_value_usd: number }[];
  affiliate_pct: number;
  store_credit_usd: number;
  custom: string[];
};
export type ServerTurn = {
  round: number;
  from: "brand" | "creator";
  package: ServerPackage;
  message: string;
  status: "offer" | "counter" | "accept" | "reject" | "walk_away";
  ts: string;
};
export type ServerDeal = {
  dealId: string;
  campaignId: string;
  status: DealStatus;
  price: number;
  budgetLeft: number;
  walkReason?: string;
  holdUntil?: string;
  acceptedOffer?: { package: ServerPackage };
  stripe?: { accountId?: string; paymentIntentId?: string; transferId?: string; refundId?: string };
  turns: ServerTurn[];
};
export type ServerCampaign = { campaignId: string; brandSlug: string; budgetTotal: number; budgetLeft: number };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && res.status !== 422) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}
const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const api = {
  createCampaign: (b: { brand?: BrandProfile; brandSlug?: string; budgetUsd?: number }) => post<ServerCampaign>("/campaigns", b),
  getCampaign: (id: string) => call<ServerCampaign>(`/campaigns/${id}`),
  startDeal: (b: { campaignId: string; creatorSlug: string; creator: Creator; creatorProfile?: CreatorProfile }) =>
    post<ServerDeal>("/deals", {
      ...b,
      // Only the scraper fields the server reads.
      creator: { handle: b.creator.handle, platform: b.creator.platform, followers: b.creator.followers, avgViews30d: b.creator.avgViews30d, engagement: b.creator.engagement, fairPrice: b.creator.fairPrice },
    }),
  getDeal: (id: string) => call<ServerDeal>(`/deals/${id}`),
  fund: (id: string) => post<ServerDeal>(`/deals/${id}/fund`),
  verify: (id: string, url: string) => post<ServerDeal & { verify?: { verified: boolean; reason?: string } }>(`/deals/${id}/verify`, { url, mock: true }),
};

/** "2x Hoodie, 18% affiliate, launch invite" for the non-cash part of a package. */
export function describeExtras(p: ServerPackage): string[] {
  return [
    ...p.product.map((x) => `${x.qty}x ${x.sku}`),
    ...(p.affiliate_pct > 0 ? [`${p.affiliate_pct}% affiliate`] : []),
    ...(p.store_credit_usd > 0 ? [`$${p.store_credit_usd} store credit`] : []),
    ...p.custom,
  ];
}
