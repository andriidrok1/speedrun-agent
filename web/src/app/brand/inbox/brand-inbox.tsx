"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit05, MessageChatCircle, Rocket02, SlashCircle01 } from "@untitledui/icons";
import type { Creator, DealStatus } from "@shared/contract";
import { DealView } from "@/app/deals/[id]/deal-view";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/base/avatar/avatar";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { api, campaignDeals, finalizeCampaign, type BrandInboxItem, type FinalizeResult } from "@/lib/deals/api";
import { ensureCampaign } from "@/lib/deals/campaign";
import type { BrandForm } from "@/lib/onboarding/profiles";
import { useSavedBrand, type SavedCampaign } from "@/lib/onboarding/store";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";
import { claimAutoPick, readPick, savePick, StepTwo, type StepTwoProgress } from "./step-two";

const POLL_MS = 4000;
const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

type Color = "brand" | "gray" | "success" | "warning" | "error";
const STATUS: Record<DealStatus, { label: string; color: Color }> = {
  negotiating: { label: "Negotiating", color: "brand" },
  agreed: { label: "Agreed", color: "success" },
  held: { label: "Paid, held", color: "brand" },
  paid_out: { label: "Paid out", color: "success" },
  refunded: { label: "Refunded", color: "gray" },
  walked_away: { label: "No deal", color: "gray" },
};

/** One badge per conversation: the thing the brand most needs to know. */
function statusOf(i: BrandInboxItem): { label: string; color: Color } {
  if (i.walkReason === "not_selected") return { label: "Not selected", color: "gray" };
  if (i.walkReason === "not_a_fit") return { label: "Not a fit", color: "gray" };
  if (i.walkReason === "budget_gap") return { label: "Needs your call", color: "warning" };
  if (i.status === "agreed" && i.approvals && !i.approvals.brand) return { label: "Needs your OK", color: "error" };
  return STATUS[i.status];
}

const COMMITTED: DealStatus[] = ["agreed", "held", "paid_out"];
const slugOf = (handle: string) => handle.replace("@", "").toLowerCase();
/** Negotiating or holding a deal: these count against the brand's headcount. */
const isLive = (i: BrandInboxItem) => !i.walkReason && (i.status === "negotiating" || COMMITTED.includes(i.status));
/** Step 2 already ran on the server (maybe in another tab). */
const isPicked = (i: BrandInboxItem) => i.walkReason === "not_selected" || !!i.selection || !!i.autopay;

// One campaign lookup per page load, even when React runs effects twice in dev.
let campaignOnce: Promise<SavedCampaign> | null = null;
function getCampaign() {
  campaignOnce ??= ensureCampaign().catch((e) => {
    campaignOnce = null;
    throw e;
  });
  return campaignOnce;
}

/** Every creator not yet contacted, best first: fair price closest to budget / headcount, skipping anyone well over the per-creator cap. */
function ranked(creators: Creator[], form: BrandForm, skip: Set<string>): Creator[] {
  const headcount = Math.max(1, form.creators || 1);
  const target = form.totalBudget / headcount;
  const cap = (form.maxPerCreator || target) * 1.3;
  const unique = new Map<string, Creator>();
  for (const c of creators) {
    const slug = slugOf(c.handle);
    if (!skip.has(slug) && c.fairPrice > 0 && c.fairPrice <= cap && !unique.has(slug)) unique.set(slug, c);
  }
  return [...unique.values()].sort((a, b) => Math.abs(a.fairPrice - target) - Math.abs(b.fairPrice - target));
}

export function BrandInbox({ creators, autoLaunch }: { creators: Creator[]; autoLaunch: boolean }) {
  const saved = useSavedBrand();
  if (saved === undefined) return null;
  if (!saved) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-16 text-center sm:px-6">
        <h1 className="text-display-xs font-semibold text-primary">Set up your campaign first</h1>
        <p className="text-md text-tertiary">Your agent needs your budget and limits before it can reach out to creators.</p>
        <Button href="/brand/setup" size="lg">Set up my campaign</Button>
      </main>
    );
  }
  return <BrandInboxView form={saved} creators={creators} autoLaunch={autoLaunch} />;
}

function BrandInboxView({ form, creators, autoLaunch }: { form: BrandForm; creators: Creator[]; autoLaunch: boolean }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<SavedCampaign | null>(null);
  const [budget, setBudget] = useState<{ budgetTotal: number; budgetLeft: number } | null>(null);
  const [items, setItems] = useState<BrandInboxItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRan = useRef(false);
  const headcount = Math.max(1, form.creators || 1);
  // One outreach at a time (launch or refill), so a poll never starts the same creator twice.
  const reaching = useRef(false);
  const answered = useRef(new Set<string>()); // walked-away deals already replaced
  const failedSlugs = useRef(new Set<string>()); // starts that errored, skipped from then on
  const [picked, setPicked] = useState<FinalizeResult | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickNotice, setPickNotice] = useState<string | null>(null);

  const bySlug = useMemo(() => new Map(creators.map((c) => [slugOf(c.handle), c])), [creators]);
  const creatorFor = useCallback(
    (i: Pick<BrandInboxItem, "creatorSlug" | "price">): Creator =>
      bySlug.get(i.creatorSlug.toLowerCase()) ?? { handle: `@${i.creatorSlug}`, platform: "instagram", followers: 0, avgViews30d: 0, engagement: 0, fairPrice: i.price || 0 },
    [bySlug],
  );

  useEffect(() => {
    getCampaign()
      .then(setCampaign)
      .catch(() => {
        setItems([]);
        setError("The deals server is not reachable.");
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!campaign) return;
    try {
      const [{ deals }, c] = await Promise.all([campaignDeals(campaign.campaignId), api.getCampaign(campaign.campaignId)]);
      setItems(deals);
      setBudget({ budgetTotal: c.budgetTotal, budgetLeft: c.budgetLeft });
      setSelected((s) => s ?? deals[0]?.dealId ?? null);
      setError(null);
    } catch {
      setItems((prev) => prev ?? []);
      setError("The deals server is not reachable.");
    }
  }, [campaign]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  /** The next best creators nobody has talked to yet, enough to bring live conversations back up to headcount. */
  const nextPicks = useCallback(
    (deals: BrandInboxItem[]) => {
      const need = headcount - deals.filter(isLive).length;
      if (need <= 0) return [];
      const skip = new Set([...deals.map((d) => d.creatorSlug.toLowerCase()), ...failedSlugs.current]);
      return ranked(creators, form, skip).slice(0, need);
    },
    [creators, form, headcount],
  );

  const reachOut = useCallback(
    async (camp: SavedCampaign, picks: Creator[]) => {
      const results = await Promise.allSettled(
        picks.map((c) => api.startDeal({ campaignId: camp.campaignId, creatorSlug: slugOf(c.handle), creator: c }).finally(() => void refresh())),
      );
      results.forEach((r, i) => r.status === "rejected" && failedSlugs.current.add(slugOf(picks[i].handle)));
      return results.filter((r) => r.status === "rejected").length;
    },
    [refresh],
  );

  const launch = useCallback(async () => {
    if (reaching.current) return;
    reaching.current = true;
    setLaunching(true);
    setError(null);
    try {
      const camp = campaign ?? (await getCampaign());
      const { deals } = await campaignDeals(camp.campaignId);
      for (const d of deals) if (d.status === "walked_away") answered.current.add(d.dealId);
      const live = deals.filter(isLive).length;
      if (live >= headcount) {
        setNote(`Your agent is already talking to ${live} creators, which is your headcount of ${headcount}.`);
        return;
      }
      const picks = nextPicks(deals);
      if (!picks.length) {
        setNote("Every creator that fits this budget already has a conversation.");
        return;
      }
      setNote(`Reaching out to ${picks.length} creators...`);
      const failed = await reachOut(camp, picks);
      setNote(
        failed
          ? `Reached ${picks.length - failed} of ${picks.length} creators. ${failed} could not be started.`
          : `Reached out to ${picks.length} creators. Your agent is negotiating with each one.`,
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
      reaching.current = false;
    }
  }, [campaign, headcount, nextPicks, reachOut, refresh]);

  useEffect(() => {
    if (!autoLaunch || !campaign || autoRan.current) return;
    autoRan.current = true;
    router.replace("/brand/inbox");
    // Not cleared on purpose: the ref already blocks a second run under dev double effects.
    setTimeout(launch, 0);
  }, [autoLaunch, campaign, launch, router]);

  // Autonomous refill: when a conversation ends without a deal, reach the next best creator so
  // live conversations stay at headcount until headcount deals are agreed or the list runs out.
  const result = useMemo(() => picked ?? (campaign ? readPick(campaign.campaignId) : null), [picked, campaign]);
  const alreadyPicked = !!result || !!items?.some(isPicked);
  useEffect(() => {
    if (!campaign || !items?.length || alreadyPicked || reaching.current) return;
    const gone = items.filter((i) => i.status === "walked_away" && !answered.current.has(i.dealId));
    for (const g of gone) answered.current.add(g.dealId);
    const picks = nextPicks(items);
    if (!picks.length && !gone.length) return;
    const who = gone.map((g) => `@${g.creatorSlug} ${g.walkReason === "not_a_fit" ? "is not a fit" : "said no"}`).join(", ");
    reaching.current = true;
    setTimeout(async () => {
      try {
        if (!picks.length) {
          if (items.filter(isLive).length < headcount) setNote(`${who}. No more creators fit this budget, so your agent works with the deals it has.`);
          return;
        }
        const names = picks.map((p) => `@${slugOf(p.handle)}`).join(", ");
        const next = `reaching out to the next best creator${picks.length > 1 ? "s" : ""}: ${names}`;
        setNote(who ? `${who}, ${next}` : next.charAt(0).toUpperCase() + next.slice(1));
        await reachOut(campaign, picks);
        await refresh();
      } finally {
        reaching.current = false;
      }
    }, 0);
  }, [campaign, items, alreadyPicked, headcount, nextPicks, reachOut, refresh]);

  // Step 2: once every conversation has settled, the agent picks the best deals and pays.
  const progress = useMemo<StepTwoProgress>(() => {
    const all = (items ?? []).filter((i) => i.walkReason !== "not_a_fit");
    const negotiating = all.filter((i) => i.status === "negotiating").length;
    const agreed = all.filter((i) => !i.walkReason && COMMITTED.includes(i.status)).length;
    const more = ranked(creators, form, new Set((items ?? []).map((i) => i.creatorSlug.toLowerCase()))).length > 0;
    const refilling = !alreadyPicked && agreed < headcount && more;
    const ready = negotiating === 0 && agreed > 0 && !refilling;
    const waiting = negotiating
      ? `${negotiating} still talking`
      : agreed === 0
        ? more
          ? "Waiting for a first deal"
          : "No deal was agreed, so there is nothing to pick yet"
        : refilling
          ? "Reaching the next best creator"
          : null;
    return { total: all.length, finished: all.length - negotiating, negotiating, agreed, ready, waiting };
  }, [items, creators, form, headcount, alreadyPicked]);

  const pick = useCallback(async () => {
    if (!campaign) return;
    setPicking(true);
    setPickNotice(null);
    try {
      const out = await finalizeCampaign(campaign.campaignId, headcount);
      if (out.ok) {
        savePick(campaign.campaignId, out.result);
        setPicked(out.result);
        await refresh();
      } else if (out.status === 404) setPickNotice("The pick step is not live on the server yet. Your agent tries again in 30 seconds.");
      else if (out.status === 409) setPickNotice(out.error || "No deal is agreed yet, so there is nothing to pick.");
      else setPickNotice(out.error);
    } catch {
      setPickNotice("The deals server is not reachable.");
    } finally {
      setPicking(false);
    }
  }, [campaign, headcount, refresh]);

  useEffect(() => {
    if (!campaign || result || !progress.ready || picking) return;
    if (!claimAutoPick(campaign.campaignId)) return;
    setTimeout(pick, 0);
  }, [campaign, result, progress.ready, picking, pick, items]);

  const winners = useMemo(
    () => new Set([...(result?.winners.map((w) => w.dealId) ?? []), ...(items ?? []).filter((i) => i.selection === "selected").map((i) => i.dealId)]),
    [result, items],
  );

  const active = useMemo(() => items?.find((i) => i.dealId === selected), [items, selected]);

  const summary = useMemo(() => {
    const counts = new Map<string, { n: number; color: Color }>();
    let committed = 0;
    for (const i of items ?? []) {
      const s = statusOf(i);
      counts.set(s.label, { n: (counts.get(s.label)?.n ?? 0) + 1, color: s.color });
      if (COMMITTED.includes(i.status) && !i.walkReason) committed += i.price;
    }
    return { counts: [...counts.entries()], committed };
  }, [items]);

  const total = budget?.budgetTotal ?? form.totalBudget;
  const left = budget?.budgetLeft ?? total;
  const launchButton = (size: "sm" | "lg") => (
    <Button size={size} iconLeading={Rocket02} onClick={launch} isLoading={launching} showTextWhileLoading isDisabled={!campaign}>
      Launch campaign
    </Button>
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title={`${form.name}: ${form.campaignName}`}
        description={`${fmtUsd(form.totalBudget)} for ${form.creators} creators, up to ${fmtUsd(form.maxPerCreator)} each. Your agent negotiates, picks the best and pays once the creator accepts.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button href="/brand/setup" size="sm" color="secondary" iconLeading={Edit05}>
              Edit campaign
            </Button>
            {launchButton("sm")}
          </div>
        }
      />

      <div className={cx(card, "space-y-3 px-5 py-4")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-tertiary">
            Budget: <span className="font-semibold text-primary tabular-nums">{fmtUsd(left)}</span> left of {fmtUsd(total)}
          </p>
          <p className="text-sm text-tertiary">
            Committed: <span className="font-semibold text-primary tabular-nums">{fmtUsd(summary.committed)}</span>
          </p>
        </div>
        <ProgressBar value={total > 0 ? Math.min(100, Math.max(0, ((total - left) / total) * 100)) : 0} />
        {summary.counts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {summary.counts.map(([label, { n, color }]) => (
              <BadgeWithDot key={label} size="sm" color={color}>
                {`${n} ${label.toLowerCase()}`}
              </BadgeWithDot>
            ))}
          </div>
        )}
      </div>

      {note && <p className="text-sm font-medium text-secondary">{note}</p>}
      {error && <p className="text-sm text-error-primary">{error}</p>}

      {items && items.length > 0 && (
        <StepTwo
          items={items}
          result={result}
          progress={progress}
          picking={picking}
          notice={pickNotice}
          budgetLeft={budget?.budgetLeft ?? null}
          creatorFor={creatorFor}
          onPick={pick}
          onOpen={setSelected}
          onChanged={() => void refresh()}
        />
      )}

      {items && items.length === 0 ? (
        <div className={cx(card, "space-y-4 px-6 py-16 text-center")}>
          <MessageChatCircle className="mx-auto size-8 text-fg-quaternary" />
          <h2 className="text-lg font-semibold text-primary">No conversations yet</h2>
          <p className="mx-auto max-w-md text-sm text-tertiary">
            Launch the campaign and your agent picks the {headcount} creators whose price fits your budget best, checks each one is a fit, and
            negotiates with all of them at once. If one says no, it moves on to the next best. Every conversation shows up here.
          </p>
          {launchButton("lg")}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ul className={cx(card, "divide-y divide-secondary overflow-hidden")}>
            {(items ?? []).map((i) => {
              const c = creatorFor(i);
              const s = statusOf(i);
              const cash = i.walkReason === "not_a_fit" ? 0 : i.status === "negotiating" ? (i.lastCash ?? 0) : i.price;
              return (
                <li key={i.dealId}>
                  <button
                    type="button"
                    onClick={() => setSelected(i.dealId)}
                    className={cx("flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary", i.dealId === selected && "bg-secondary")}
                  >
                    <Avatar size="md" src={c.avatarUrl} alt={c.name ?? c.handle} initials={(c.name ?? i.creatorSlug).slice(0, 2).toUpperCase()} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <span className="text-sm font-semibold text-primary">{c.name ?? `@${i.creatorSlug}`}</span>
                          {c.name && <span className="ml-1.5 text-xs text-tertiary">@{i.creatorSlug}</span>}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{cash ? fmtUsd(cash) : ""}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <BadgeWithDot size="sm" color={s.color}>
                          {s.label}
                        </BadgeWithDot>
                        {winners.has(i.dealId) && (
                          <BadgeWithDot size="sm" color="success">
                            Winner
                          </BadgeWithDot>
                        )}
                      </span>
                      {i.walkReason === "not_a_fit"
                        ? i.fitReasons?.[0] && <span className="line-clamp-2 block text-xs text-tertiary">{i.fitReasons[0]}</span>
                        : i.lastMessage && <span className="line-clamp-2 block text-xs text-tertiary">{i.lastMessage}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <section className="min-w-0">
            {!active ? (
              <p className="text-sm text-tertiary">{items ? "Pick a conversation." : "Loading conversations..."}</p>
            ) : active.walkReason === "not_a_fit" ? (
              <NotAFit item={active} creator={creatorFor(active)} />
            ) : (
              <DealView key={active.dealId} creator={creatorFor(active)} existing={{ dealId: active.dealId, brandName: form.name }} perspective="brand" embedded />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function NotAFit({ item, creator }: { item: BrandInboxItem; creator: Creator }) {
  const reasons = item.fitReasons?.length ? item.fitReasons : ["The fit check found this creator does not match the campaign."];
  return (
    <div className={cx(card, "space-y-4 p-6")}>
      <div className="flex items-center gap-3">
        <Avatar size="lg" src={creator.avatarUrl} alt={creator.name ?? creator.handle} initials={(creator.name ?? item.creatorSlug).slice(0, 2).toUpperCase()} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-primary">{creator.name ?? `@${item.creatorSlug}`}</h2>
          <p className="text-sm text-tertiary">
            @{item.creatorSlug}
            {creator.fairPrice ? `, fair price ${fmtUsd(creator.fairPrice)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg bg-secondary p-4">
        <SlashCircle01 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-primary">Not a fit, so no conversation was started</p>
          <ul className="list-disc space-y-1 pl-4 text-sm text-secondary">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-sm text-tertiary">Nothing was offered and no budget was used. Launch again to reach the next best creator.</p>
    </div>
  );
}
