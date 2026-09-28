// fairPrice = avgViews30d / 1000 x CPM(niche) x engagementMultiplier
// See docs/specs/web-app.md. CPMs are placeholder guesses.

export const CPM: Record<string, number> = {
  fitness: 20,
  beauty: 25,
  tech: 30,
  finance: 35,
  food: 15,
  gaming: 12,
  comedy: 15,
  lifestyle: 18,
  other: 18,
};

export function cpmFor(niche?: string) {
  return CPM[niche ?? "other"] ?? CPM.other;
}

export function engagementMultiplier(engagement: number) {
  return Math.min(1.3, Math.max(0.8, 1 + (engagement - 0.04) * 5));
}

export function fairPrice(avgViews30d: number, engagement: number, niche?: string) {
  return Math.round((avgViews30d / 1000) * cpmFor(niche) * engagementMultiplier(engagement));
}
