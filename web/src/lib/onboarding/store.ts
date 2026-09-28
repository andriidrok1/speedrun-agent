"use client";
// Per-browser memory for the demo: what each side entered in onboarding.
import { useMemo, useSyncExternalStore } from "react";
import type { BrandForm, CreatorForm } from "./profiles";

const KEYS = { brand: "cd.brand", creator: "cd.creator", campaign: "cd.campaign" } as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the page still works for this visit
  }
}

export const loadBrand = () => read<BrandForm>(KEYS.brand);
export const saveBrand = (f: BrandForm) => {
  write(KEYS.brand, f);
  write(KEYS.campaign, null); // new rules, new campaign
};
export const loadCreator = () => read<CreatorForm>(KEYS.creator);
export const saveCreator = (f: CreatorForm) => write(KEYS.creator, f);

const noop = () => () => {};
function useStored<T>(key: string): T | null | undefined {
  // Snapshot is the raw string (stable between renders); undefined on the server.
  const raw = useSyncExternalStore(
    noop,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => undefined,
  );
  return useMemo(() => (raw === undefined ? undefined : raw ? (JSON.parse(raw) as T) : null), [raw]);
}
/** undefined while not loaded (server render), null when nothing is saved. */
export const useSavedBrand = () => useStored<BrandForm>(KEYS.brand);
export const useSavedCreator = () => useStored<CreatorForm>(KEYS.creator);

export type SavedCampaign = { campaignId: string; brandName: string; budgetTotal: number };
export const loadCampaign = () => read<SavedCampaign>(KEYS.campaign);
export const saveCampaign = (c: SavedCampaign | null) => write(KEYS.campaign, c);
