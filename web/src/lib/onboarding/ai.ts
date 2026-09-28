// Text onboarding: send the user's own words to POST /onboard and read back a filled form,
// then turn that form into plain sentences for the "does this look right?" summary.
import { API } from "@/lib/deals/api";
import { fmtUsd } from "@/lib/format";
import { type BrandForm, type CreatorForm, parseProducts } from "./profiles";

export type OnboardSide = "brand" | "creator";
type FormFor<S extends OnboardSide> = S extends "brand" ? BrandForm : CreatorForm;

export async function buildFromText<S extends OnboardSide>(side: S, text: string, url?: string, current?: FormFor<S>): Promise<FormFor<S>> {
  let res: Response;
  try {
    res = await fetch(`${API}/onboard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        side,
        text,
        url: url?.trim() || undefined,
        current,
      }),
      cache: "no-store",
    });
  } catch {
    throw new Error("Could not reach the server. Is it running?");
  }
  const data = (await res.json().catch(() => ({}))) as {
    form?: FormFor<S>;
    error?: string;
  };
  if (!res.ok || !data.form) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data.form;
}

/** One sentence of the summary. Private lines are only ever seen by your own agent. */
export type SummaryLine = { text: string; private?: boolean };

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const list = (s: string) =>
  s
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);
const joinAnd = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function brandSummary(f: BrandForm): SummaryLine[] {
  const deliverables = joinAnd([f.reels > 0 ? plural(f.reels, "reel") : "", f.stories > 0 ? plural(f.stories, "story", "stories") : ""].filter(Boolean));
  const extras = [
    ...parseProducts(f.products).map((p) => `${p.sku} (worth ${fmtUsd(p.retail_value_usd)})`),
    ...(f.affiliateMax > 0 ? [`${f.affiliateMin} to ${f.affiliateMax}% affiliate commission`] : []),
    ...list(f.perks),
  ];
  const noGos = list(f.noGos);
  return [
    {
      text: `${f.name || "Your brand"}${f.category ? ` (${f.category})` : ""} is looking for ${plural(f.creators, "creator")} for "${f.campaignName}", ${deliverables} each.`,
    },
    ...(f.goal
      ? [
          {
            text: `Goal: ${f.goal.replace(/\.$/, "")}. Audience: ${f.audience || "not set"}.`,
          },
        ]
      : []),
    {
      text: `Your agent opens around ${fmtUsd(f.startingOffer)} and never goes above ${fmtUsd(f.maxPerCreator)} per creator.`,
      private: true,
    },
    {
      text: `Total budget is ${fmtUsd(f.totalBudget)} across all creators.`,
      private: true,
    },
    {
      text: extras.length ? `Besides cash you can offer ${joinAnd(extras)}.` : "You pay in cash only, no products or perks.",
    },
    ...(noGos.length ? [{ text: `No-gos: ${noGos.join(", ")}.` }] : []),
  ];
}

export function creatorSummary(f: CreatorForm): SummaryLine[] {
  const barter = [f.openToProducts && "free products", f.openToAffiliate && "affiliate commission"].filter(Boolean) as string[];
  const refuses = list(f.refuses);
  const dealbreakers = list(f.dealbreakers);
  const favorites = list(f.favoriteBrands ?? "");
  const fav = (x: number | undefined, normal: number) => (x && x > 0 ? x : normal);
  return [
    {
      text: `${f.handle ? `@${f.handle}` : "You"}${f.name ? ` (${f.name})` : ""}, ${f.niche || "creator"}.`,
    },
    {
      text: `Your rate card: ${fmtUsd(f.idealReel)} a reel, ${fmtUsd(f.idealStory)} a story, ${fmtUsd(f.idealPost)} a feed post.`,
    },
    {
      text: `Your agent never goes below ${fmtUsd(f.minReel)} for a reel, ${fmtUsd(f.minStory)} for a story or ${fmtUsd(f.minPost)} for a post.`,
    },
    {
      text: barter.length
        ? `${joinAnd(barter).replace(/^./, (c) => c.toUpperCase())} can count toward the price.`
        : "Cash only: products and affiliate deals do not count.",
    },
    ...(refuses.length ? [{ text: `You never work with ${joinAnd(refuses)}.` }] : []),
    ...(dealbreakers.length ? [{ text: `You always refuse ${joinAnd(dealbreakers)}.` }] : []),
    ...(favorites.length
      ? [
          {
            text: `For ${favorites.length < 2 ? favorites[0] : `${favorites.slice(0, -1).join(", ")} or ${favorites[favorites.length - 1]}`} you would go as low as ${fmtUsd(fav(f.favoriteMinReel, f.minReel))} a reel, ${fmtUsd(fav(f.favoriteMinStory, f.minStory))} a story, ${fmtUsd(fav(f.favoriteMinPost, f.minPost))} a post.`,
          },
        ]
      : []),
  ];
}
