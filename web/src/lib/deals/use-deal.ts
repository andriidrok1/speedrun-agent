"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Creator, DealStatus } from "@shared/contract";
import { buildCreatorProfile } from "@/lib/onboarding/profiles";
import { loadCreator, type SavedCampaign } from "@/lib/onboarding/store";
import { fmtUsd } from "@/lib/format";
import { api, type Approvals, describeExtras, type ServerDeal, type ServerDeliverable, type ServerPackage } from "./api";
import { ensureCampaign } from "./campaign";
import { negotiate } from "./negotiate";

export const PLATFORM_FEE = 0.1;
const POLL_MS = 2500;

export type ChatOffer = {
  from: "brand" | "creator";
  amount: number;
  message: string;
  round: number;
  extras: string[];
  final: boolean;
  pkg?: ServerPackage;
  deliverables: ServerDeliverable[];
  usageRights?: string;
  exclusivity?: { category: string; days: number };
  deadline?: string;
  valueForCreator?: number;
};
export type Side = "brand" | "creator";
export type DealEvent = { status: DealStatus; text: string };

export interface DealState {
  /** live = real server (AI agents + Stripe test mode); offline = scripted fallback */
  mode: "connecting" | "live" | "offline";
  status: DealStatus;
  price: number;
  budgetLeft: number | null;
  brandName: string;
  offers: ChatOffer[];
  events: DealEvent[];
  typing: "brand" | "creator" | null;
  deliverables?: string;
  deadline?: string;
  stripe?: ServerDeal["stripe"];
  walkReason?: string;
  /** Cash gap in USD when the deal ended with no overlap (walkReason "budget_gap"). */
  gapUsd?: number;
  brandMaxUsd?: number;
  creatorMinUsd?: number;
  approvals: Approvals;
  /** The brand's agent picked this deal (step 2) and pays as soon as the creator accepts. */
  autopay: boolean;
  busy: boolean;
  error: string | null;
  approve: (side: Side) => void;
  pay: () => void;
  markLive: () => void;
  restart: () => void;
}

const net = (price: number) => Math.round(price * (1 - PLATFORM_FEE) * 100) / 100;
const plural = (n: number, t: string) => `${n} ${n > 1 ? (t === "story" ? "stories" : `${t}s`) : t}`;

/** System lines in the chat, derived from the deal status. */
function eventsFor(status: DealStatus, price: number, extras: string[], handle: string, walkReason?: string, fitReasons?: string[]): DealEvent[] {
  const order: DealStatus[] = ["agreed", "held", "paid_out"];
  const reached = status === "refunded" ? 2 : order.indexOf(status) + 1;
  const out: DealEvent[] = [];
  if (reached >= 1)
    out.push({
      status: "agreed",
      text: `Deal agreed at ${fmtUsd(price)} cash${extras.length ? ` + ${extras.join(", ")}` : ""}`,
    });
  if (reached >= 2)
    out.push({
      status: "held",
      text: `Brand paid ${fmtUsd(price)} with Stripe. The money is held until the post is live.`,
    });
  if (status === "paid_out")
    out.push({
      status: "paid_out",
      text: `Post verified. Paid ${fmtUsd(net(price))} to ${handle}, platform kept ${fmtUsd(price - net(price))}`,
    });
  if (status === "refunded")
    out.push({
      status: "refunded",
      text: "Post never went live. The brand was refunded.",
    });
  if (status === "walked_away")
    out.push({
      status: "walked_away",
      text:
        walkReason === "not_selected"
          ? "The brand went with another creator this time."
          : walkReason === "not_a_fit"
          ? `Not a fit, so no conversation started. ${fitReasons?.[0] ?? ""}`.trim()
          : walkReason === "budget_gap"
          ? "Paused: the budgets do not overlap yet. Needs your call."
          : walkReason === "budget"
            ? "No deal: over the brand's remaining budget"
            : "No deal this time. Both sides held their line.",
    });
  return out;
}

// Starts are shared across React strict-mode double effects so one visit creates one deal.
const starts = new Map<string, Promise<{ deal: ServerDeal; campaign: SavedCampaign }>>();

/** Open an existing deal (creator inbox) instead of starting a new negotiation. */
export type ExistingDeal = { dealId: string; brandName: string };

export function useDeal(creator: Creator, existing?: ExistingDeal): DealState {
  const handle = creator.handle.replace("@", "");
  const [nonce] = useState(() => Math.random().toString(36).slice(2));
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<DealState["mode"]>("connecting");
  const [deal, setDeal] = useState<ServerDeal | null>(null);
  const [campaign, setCampaign] = useState<SavedCampaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localApprovals, setLocalApprovals] = useState<Approvals>({
    brand: false,
    creator: false,
  });
  const offline = useScriptedDeal(creator, mode === "offline");

  useEffect(() => {
    let cancelled = false;
    const key = `${nonce}:${run}`;
    if (!starts.has(key)) {
      starts.set(
        key,
        (async () => {
          if (existing && run === 0) {
            const d = await api.getDeal(existing.dealId);
            return { deal: d, campaign: { campaignId: d.campaignId, brandName: existing.brandName, budgetTotal: 0 } };
          }
          const c = await ensureCampaign();
          const saved = loadCreator();
          const profile = saved && saved.handle.toLowerCase() === handle.toLowerCase() ? buildCreatorProfile(saved, creator) : undefined;
          const d = await api.startDeal({
            campaignId: c.campaignId,
            creatorSlug: handle,
            creator,
            creatorProfile: profile,
          });
          return { deal: d, campaign: c };
        })(),
      );
    }
    starts
      .get(key)!
      .then(({ deal: d, campaign: c }) => {
        if (cancelled) return;
        setCampaign(c);
        setDeal(d);
        setMode("live");
      })
      .catch(() => !cancelled && setMode("offline"));
    return () => {
      cancelled = true;
    };
  }, [nonce, run, handle, creator, existing]);

  // Poll the transcript while the agents talk.
  const dealId = deal?.dealId;
  const negotiating = deal?.status === "negotiating";
  // In the inbox the other side can act at any time (accept, pay), so keep following the deal.
  const follow = negotiating || (!!existing && deal?.status !== "paid_out" && deal?.status !== "walked_away" && deal?.status !== "refunded");
  useEffect(() => {
    if (mode !== "live" || !dealId || !follow) return;
    const t = setInterval(async () => {
      try {
        setDeal(await api.getDeal(dealId));
      } catch {
        // keep the last state, try again next tick
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [mode, dealId, follow]);

  const act = useCallback(
    async (
      fn: (id: string) => Promise<
        ServerDeal & {
          error?: string;
          verify?: { verified: boolean; reason?: string };
        }
      >,
    ) => {
      if (!deal) return;
      setBusy(true);
      setError(null);
      try {
        const next = await fn(deal.dealId);
        if (next.verify && !next.verify.verified) setError(`Post not verified: ${next.verify.reason ?? "check failed"}`);
        setDeal((d) => ({
          ...(d as ServerDeal),
          ...next,
          turns: d?.turns ?? [],
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [deal],
  );

  if (mode === "offline") return { ...offline, restart: offline.restart };

  const turns = deal?.turns ?? [];
  const offers: ChatOffer[] = turns.map((t) => ({
    from: t.from,
    amount: t.package.cash_usd,
    message: t.message,
    round: t.round,
    extras: describeExtras(t.package),
    final: t.status === "accept" || t.status === "walk_away",
    pkg: t.package,
    deliverables: t.deliverables ?? [],
    usageRights: t.usage_rights,
    exclusivity: t.exclusivity,
    deadline: t.deadline,
    valueForCreator: t.value_for_creator_usd,
  }));
  const last = turns[turns.length - 1];
  const status = deal?.status ?? "negotiating";
  const price = deal?.price ?? 0;
  const accepted = deal?.acceptedOffer?.package;

  return {
    mode,
    status,
    price: status === "negotiating" ? (offers[offers.length - 1]?.amount ?? 0) : price,
    budgetLeft: deal?.budgetLeft ?? campaign?.budgetTotal ?? null,
    brandName: campaign?.brandName ?? "Brand",
    offers,
    events: eventsFor(status, price, accepted ? describeExtras(accepted) : [], creator.handle, deal?.walkReason, deal?.fitReasons),
    typing: status === "negotiating" ? (last ? (last.from === "brand" ? "creator" : "brand") : "brand") : null,
    deliverables: last?.deliverables?.map((d) => plural(d.qty, d.type)).join(" + "),
    deadline: last?.deadline,
    stripe: deal?.stripe,
    walkReason: deal?.walkReason,
    gapUsd: typeof deal?.gap_usd === "number" ? deal.gap_usd : undefined,
    brandMaxUsd: deal?.brand_max_usd,
    creatorMinUsd: deal?.creator_min_usd,
    approvals: deal?.approvals ?? localApprovals,
    autopay: !!deal?.autopay,
    busy,
    error: error ?? (deal?.status === "agreed" ? (deal.lastError ?? null) : null),
    approve: async (side) => {
      if (!deal) return;
      setError(null);
      try {
        const next = await api.approve(deal.dealId, side);
        if (next?.approvals)
          setDeal((d) => ({
            ...(d as ServerDeal),
            ...next,
            turns: next.turns?.length ? next.turns : (d?.turns ?? []),
          }));
        else setLocalApprovals((a) => ({ ...a, [side]: true }));
      } catch {
        // Endpoint missing or unreachable: keep the demo moving with a local flag.
        setLocalApprovals((a) => ({ ...a, [side]: true }));
      }
    },
    pay: () => act(api.fund),
    markLive: () => act((id) => api.verify(id, `https://www.instagram.com/${handle}/`)),
    restart: () => {
      setDeal(null);
      setError(null);
      setLocalApprovals({ brand: false, creator: false });
      setMode("connecting");
      setRun((r) => r + 1);
    },
  };
}

// ---------------- offline fallback: scripted negotiation, fake money ----------------

const DELAY_MS = 1600;
const OFFLINE_DELIVERABLES: ServerDeliverable[] = [
  { type: "reel", qty: 1 },
  { type: "story", qty: 1 },
];

function useScriptedDeal(creator: Creator, enabled: boolean): DealState {
  const s = useMemo(() => negotiate(creator, `offline-${creator.handle}`), [creator]);
  const [shown, setShown] = useState(0);
  const [status, setStatus] = useState<DealStatus>("negotiating");
  const [busy, setBusy] = useState(false);
  const [approvals, setApprovals] = useState<Approvals>({
    brand: false,
    creator: false,
  });

  useEffect(() => {
    if (!enabled || status !== "negotiating") return;
    const t = setTimeout(() => (shown < s.length ? setShown((n) => n + 1) : setStatus("agreed")), shown === 0 ? 600 : DELAY_MS);
    return () => clearTimeout(t);
  }, [enabled, shown, status, s]);

  const offers: ChatOffer[] = s.slice(0, shown).map((o, i) => ({
    from: o.from,
    amount: o.amount,
    message: o.message,
    round: Math.floor(i / 2) + 1,
    extras: [],
    final: i === s.length - 1,
    pkg: {
      cash_usd: o.amount,
      product: [],
      affiliate_pct: 0,
      store_credit_usd: 0,
      custom: [],
    },
    deliverables: OFFLINE_DELIVERABLES,
    usageRights: "organic_only",
    exclusivity: { category: "apparel", days: 30 },
  }));
  const agreed = s[s.length - 1].amount;
  const price = status === "negotiating" ? (offers[offers.length - 1]?.amount ?? 0) : agreed;
  const step = (next: DealStatus) => {
    setBusy(true);
    setTimeout(() => {
      setStatus(next);
      setBusy(false);
    }, 900);
  };
  return {
    mode: "offline",
    status,
    price,
    budgetLeft: status === "negotiating" ? 20_000 : 20_000 - agreed,
    brandName: "Demo brand",
    offers,
    events: eventsFor(status, agreed, [], creator.handle),
    typing: status === "negotiating" && shown < s.length ? s[shown].from : null,
    deliverables: "1 reel + 1 story",
    approvals,
    autopay: false,
    busy,
    error: null,
    approve: (side) => setApprovals((a) => ({ ...a, [side]: true })),
    pay: () => step("held"),
    markLive: () => step("paid_out"),
    restart: () => {
      setApprovals({ brand: false, creator: false });
      setShown(0);
      setStatus("negotiating");
    },
  };
}
