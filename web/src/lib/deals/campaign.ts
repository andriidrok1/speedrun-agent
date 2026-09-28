"use client";
// One campaign per saved brand. Without brand onboarding the demo uses the bundled Marine Layer profile.
import { api } from "./api";
import { buildBrandProfile } from "@/lib/onboarding/profiles";
import { loadBrand, loadCampaign, saveCampaign, type SavedCampaign } from "@/lib/onboarding/store";

export async function ensureCampaign(): Promise<SavedCampaign> {
  const saved = loadCampaign();
  if (saved) {
    try {
      const c = await api.getCampaign(saved.campaignId);
      return { ...saved, budgetTotal: c.budgetTotal };
    } catch {
      // server state was reset: make a new one below
    }
  }
  const brand = loadBrand();
  const created = brand
    ? await api.createCampaign({ brand: buildBrandProfile(brand), budgetUsd: brand.totalBudget, headcount: Math.max(1, brand.creators || 1) })
    : await api.createCampaign({ brandSlug: "marine-layer", budgetUsd: 20_000 });
  const next = { campaignId: created.campaignId, brandName: brand?.name ?? "Marine Layer", budgetTotal: created.budgetTotal };
  saveCampaign(next);
  return next;
}
