"use client";
// Step 2 of the brand messenger: once every negotiation has settled, the brand's agent picks the best
// creators, releases the rest, and pays each winner as soon as they accept.

import { useEffect, useState } from "react";
import { BankNote01, Clock, CreditCard01, Lock01, Stars02, Trophy01, User01 } from "@untitledui/icons";
import type { Creator } from "@shared/contract";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { api, type BrandInboxItem, type FinalizeResult } from "@/lib/deals/api";
import { PLATFORM_FEE } from "@/lib/deals/use-deal";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";
const net = (price: number) => Math.round(price * (1 - PLATFORM_FEE) * 100) / 100;
const shortId = (id: string) => (id.length > 14 ? `${id.slice(0, 3)}...${id.slice(-6)}` : id);

// Per tab, per campaign: the pick survives a reload so the agent never loops on it.
const pickKey = (campaignId: string) => `cd.finalize.${campaignId}`;
const tryKey = (campaignId: string) => `cd.finalize.try.${campaignId}`;
export function readPick(campaignId: string): FinalizeResult | null {
  try {
    const raw = sessionStorage.getItem(pickKey(campaignId));
    return raw ? (JSON.parse(raw) as FinalizeResult) : null;
  } catch {
    return null;
  }
}
export function savePick(campaignId: string, r: FinalizeResult) {
  try {
    sessionStorage.setItem(pickKey(campaignId), JSON.stringify(r));
  } catch {
    // storage blocked: the pick still shows for this visit
  }
}
/** true when the agent may try the pick on its own now (at most once per 30s per campaign). */
export function claimAutoPick(campaignId: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(tryKey(campaignId)) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(tryKey(campaignId), String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export type StepTwoProgress = { total: number; finished: number; negotiating: number; agreed: number; ready: boolean; waiting: string | null };

export function StepTwo({
  items,
  result,
  progress,
  picking,
  notice,
  budgetLeft,
  creatorFor,
  onPick,
  onOpen,
  onChanged,
}: {
  items: BrandInboxItem[];
  result: FinalizeResult | null;
  progress: StepTwoProgress;
  picking: boolean;
  notice: string | null;
  budgetLeft: number | null;
  creatorFor: (i: { dealId: string; creatorSlug: string; price: number }) => Creator;
  onPick: () => void;
  onOpen: (dealId: string) => void;
  onChanged: () => void;
}) {
  const { total, finished, ready, waiting } = progress;
  return (
    <section className={cx(card, "space-y-4 px-5 py-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-secondary">
            <Stars02 className="size-5 text-fg-brand-primary" />
          </span>
          <div>
            <h2 className="text-md font-semibold text-primary">Step 2: your agent&apos;s pick</h2>
            <p className="text-sm text-tertiary">
              {result
                ? "Your agent picked the best deals, released the rest of the budget, and pays each winner the moment they accept."
                : "When every negotiation is done, your agent picks the best creators and pays them. No clicks needed."}
            </p>
          </div>
        </div>
        {!result && (
          <Button size="sm" iconLeading={Trophy01} onClick={onPick} isLoading={picking} showTextWhileLoading isDisabled={!ready}>
            Pick the best and pay
          </Button>
        )}
      </div>

      {!result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-secondary">
              {ready ? (picking ? "All negotiations are done. Your agent is picking now..." : "All negotiations are done. Ready to pick.") : `Negotiations running: ${finished} of ${total} finished`}
            </span>
            {waiting && <span className="text-tertiary">{waiting}</span>}
          </div>
          <ProgressBar value={total > 0 ? (finished / total) * 100 : 0} />
        </div>
      )}
      {notice && <p className="text-sm text-warning-primary">{notice}</p>}

      {result && (
        <div className="space-y-3">
          <ul className="grid gap-3 md:grid-cols-2">
            {result.winners.map((w) => (
              <Winner key={w.dealId} winner={w} item={items.find((i) => i.dealId === w.dealId)} creator={creatorFor(w)} onOpen={onOpen} onChanged={onChanged} />
            ))}
          </ul>
          {result.others.length > 0 && (
            <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
              {result.others.map((o) => {
                const c = creatorFor(o);
                return (
                  <li key={o.dealId}>
                    <button type="button" onClick={() => onOpen(o.dealId)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary">
                      <Avatar size="sm" src={c.avatarUrl} alt={c.name ?? c.handle} initials={(c.name ?? o.creatorSlug).slice(0, 2).toUpperCase()} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-secondary">@{o.creatorSlug}</span>
                          <Badge size="sm" color="gray">
                            Not selected
                          </Badge>
                        </span>
                        {o.reason && <span className="block truncate text-xs text-tertiary">{o.reason}</span>}
                      </span>
                      <span className="shrink-0 text-sm text-tertiary tabular-nums">{fmtUsd(o.price)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-sm text-tertiary">
            Budget left: <span className="font-semibold text-primary tabular-nums">{fmtUsd(budgetLeft ?? result.budgetLeft)}</span>
          </p>
        </div>
      )}
    </section>
  );
}

function Winner({
  winner,
  item,
  creator,
  onOpen,
  onChanged,
}: {
  winner: FinalizeResult["winners"][number];
  item?: BrandInboxItem;
  creator: Creator;
  onOpen: (dealId: string) => void;
  onChanged: () => void;
}) {
  const status = item?.status ?? winner.status;
  const price = item?.price || winner.price;
  const creatorOk = !!item?.approvals?.creator;
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list endpoint has no Stripe ids, so read the deal once it is paid.
  const paid = status === "held" || status === "paid_out";
  useEffect(() => {
    if (!paid || paymentId) return;
    let cancelled = false;
    api
      .getDeal(winner.dealId)
      .then((d) => !cancelled && setPaymentId(d.stripe?.paymentIntentId ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paid, paymentId, winner.dealId]);

  async function accept() {
    setAccepting(true);
    setError(null);
    try {
      const d = await api.approve(winner.dealId, "creator");
      if (!d) setError("The accept step is not live on the server yet.");
      else if (d.lastError) setError(`Payment failed: ${d.lastError}`);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAccepting(false);
    }
  }

  const failed = error ?? (status === "agreed" && item?.lastError ? `Payment failed: ${item.lastError}` : null);
  const line =
    status === "paid_out"
      ? { icon: BankNote01, text: `Post live, paid out ${fmtUsd(net(price))}`, tone: "text-success-primary" }
      : status === "held"
        ? { icon: Lock01, text: `Paid ${fmtUsd(price)}, Stripe is holding it`, tone: "text-brand-secondary" }
        : creatorOk
          ? { icon: CreditCard01, text: "Accepted. Your agent is paying with Stripe...", tone: "text-secondary" }
          : { icon: Clock, text: `Waiting for @${winner.creatorSlug} to accept`, tone: "text-secondary" };

  return (
    <li className="space-y-3 rounded-lg bg-secondary p-4">
      <button type="button" onClick={() => onOpen(winner.dealId)} className="flex w-full items-center gap-3 text-left">
        <Avatar size="md" src={creator.avatarUrl} alt={creator.name ?? creator.handle} initials={(creator.name ?? winner.creatorSlug).slice(0, 2).toUpperCase()} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-primary">{creator.name ?? `@${winner.creatorSlug}`}</span>
            <BadgeWithDot size="sm" color="success">
              Winner
            </BadgeWithDot>
          </span>
          <span className="block text-xs text-tertiary">@{winner.creatorSlug}</span>
        </span>
        <span className="shrink-0 text-lg font-semibold text-primary tabular-nums">{fmtUsd(price)}</span>
      </button>
      {winner.reason && <p className="text-sm text-secondary">{winner.reason}</p>}
      <div className="space-y-2 border-t border-secondary pt-3">
        <p className={cx("flex items-center gap-1.5 text-sm font-medium", line.tone)}>
          <line.icon className="size-4 shrink-0" />
          {line.text}
        </p>
        {paid && paymentId && <p className="font-mono text-xs text-tertiary">payment {shortId(paymentId)}</p>}
        {status === "agreed" && !creatorOk && (
          <Button size="sm" color="secondary" iconLeading={User01} onClick={accept} isLoading={accepting} showTextWhileLoading>
            Accept as creator (demo)
          </Button>
        )}
        {failed && <p className="text-xs text-error-primary">{failed}</p>}
      </div>
    </li>
  );
}
