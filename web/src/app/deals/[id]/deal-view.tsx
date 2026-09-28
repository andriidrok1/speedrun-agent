"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, BankNote01, Building02, Check, CheckVerified01, CreditCard01, Lock01, RefreshCw01, User01, XClose } from "@untitledui/icons";
import type { Creator, DealStatus } from "@shared/contract";
import { AvatarLabelGroup } from "@/components/base/avatar/avatar-label-group";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { describeDeliverables, fairFor } from "@/components/app/deal/deal-math";
import { GAP_HINTS, GapCard } from "@/components/app/deal/gap-card";
import { NegotiationChart } from "@/components/app/deal/negotiation-chart";
import { PackageChips } from "@/components/app/deal/package-chips";
import { WhatsMade } from "@/components/app/deal/whats-made";
import { Button } from "@/components/base/buttons/button";
import { type ChatOffer, type DealEvent, type DealState, type ExistingDeal, PLATFORM_FEE, useDeal } from "@/lib/deals/use-deal";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";

const STEPS: { status: DealStatus; label: string; hint: string }[] = [
  {
    status: "negotiating",
    label: "Negotiating",
    hint: "Two agents trade offers",
  },
  { status: "agreed", label: "Agreed", hint: "Price is locked" },
  {
    status: "held",
    label: "Paid and held",
    hint: "Brand paid, Stripe holds the money",
  },
  {
    status: "paid_out",
    label: "Paid out",
    hint: "Post verified, creator paid",
  },
];

const STATUS_LABEL: Record<DealStatus, string> = {
  negotiating: "Negotiating",
  agreed: "Agreed",
  held: "Funds held",
  paid_out: "Paid out",
  refunded: "Refunded",
  walked_away: "No deal",
};

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

type Perspective = "platform" | "creator" | "brand";

export function DealView({ creator, existing, perspective = "platform", embedded = false }: { creator: Creator; existing?: ExistingDeal; perspective?: Perspective; embedded?: boolean }) {
  const d = useDeal(creator, existing);
  const [hint, setHint] = useState<keyof typeof GAP_HINTS | null>(null);
  const needsCall = d.status === "walked_away" && d.walkReason === "budget_gap";
  const latest = d.offers[d.offers.length - 1];
  const locked = d.status !== "negotiating" && d.status !== "walked_away";
  const brandBest = d.offers.filter((o) => o.from === "brand").reduce<number | undefined>((m, o) => (m === undefined || o.amount > m ? o.amount : m), undefined);
  const platform = creator.platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <main className={embedded ? "w-full space-y-6" : "mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6"}>
      {!embedded && (
        <Button href="/brand/creators" color="link-gray" size="sm" iconLeading={ArrowLeft}>
          All creators
        </Button>
      )}

      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <AvatarLabelGroup
          size="lg"
          src={creator.avatarUrl}
          initials={(creator.name ?? creator.handle).replace("@", "").slice(0, 2).toUpperCase()}
          alt=""
          title={`${d.brandName} x ${creator.name ?? creator.handle}`}
          subtitle={`${creator.handle} on ${platform}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <BadgeWithDot size="md" color={d.mode === "live" ? "brand" : d.mode === "offline" ? "warning" : "gray"}>
            {d.mode === "live" ? "Live: AI agents + Stripe test mode" : d.mode === "offline" ? "Offline demo: server not reachable" : "Connecting"}
          </BadgeWithDot>
          <BadgeWithDot size="md" color={d.status === "paid_out" ? "success" : needsCall ? "warning" : d.status === "walked_away" ? "error" : "gray"}>
            {needsCall ? "Needs your call" : STATUS_LABEL[d.status]}
          </BadgeWithDot>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className={card}>
            <div className="flex items-start justify-between gap-4 border-b border-secondary px-5 py-4">
              <div>
                <h2 className="text-md font-semibold text-primary">Live negotiation</h2>
                <p className="text-sm text-tertiary">Each agent knows only its own limits. Neither ever sees the other side&apos;s.</p>
              </div>
              <Button size="sm" color="secondary" iconLeading={RefreshCw01} onClick={d.restart} isDisabled={d.status === "held" || d.busy}>
                New negotiation
              </Button>
            </div>
            {hint && d.status === "negotiating" && (
              <p className="flex items-center gap-2 border-b border-secondary bg-secondary px-5 py-2.5 text-xs text-secondary">
                <AlertCircle className="size-4 shrink-0 text-fg-quaternary" />
                {GAP_HINTS[hint]}
              </p>
            )}
            <Feed offers={d.offers} events={d.events} typing={d.typing} fair={creator.fairPrice} connecting={d.mode === "connecting"} needsCall={needsCall} />
          </section>
          <NegotiationChart offers={d.offers} fairReel={creator.fairPrice} />
        </div>

        <aside className="space-y-6">
          {needsCall && (
            <GapCard
              gap={d.gapUsd}
              brandMax={d.brandMaxUsd ?? brandBest}
              creatorMin={d.creatorMinUsd}
              onPick={(k) => {
                setHint(k);
                d.restart();
              }}
            />
          )}
          <PriceCard offers={d.offers} fair={creator.fairPrice} status={d.status} price={d.price} />
          <WhatsMade offer={latest} locked={locked} />
          <Timeline status={d.status} needsCall={needsCall} />
          <div className={cx(card, "space-y-4 p-5")}>
            <h2 className="text-md font-semibold text-primary">Terms</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Platform fee" value={`${PLATFORM_FEE * 100}%`} />
              <Row label="Creator gets" value={d.price ? fmtUsd(Math.round(d.price * (1 - PLATFORM_FEE) * 100) / 100) : "-"} />
              {d.budgetLeft !== null && <Row label="Brand budget left" value={fmtUsd(d.budgetLeft)} />}
            </dl>
            {d.stripe && (d.stripe.paymentIntentId || d.stripe.transferId) && (
              <dl className="space-y-1 border-t border-secondary pt-3 font-mono text-xs text-tertiary">
                {d.stripe.paymentIntentId && <div>payment {d.stripe.paymentIntentId}</div>}
                {d.stripe.transferId && <div>transfer {d.stripe.transferId}</div>}
                {d.stripe.accountId && <div>creator {d.stripe.accountId}</div>}
              </dl>
            )}
            <Action d={d} perspective={perspective} needsCall={needsCall} />
            {d.error && <p className="text-sm text-error-primary">{d.error}</p>}
          </div>
        </aside>
      </div>
    </main>
  );
}

function Feed({
  offers,
  events,
  typing,
  fair,
  connecting,
  needsCall,
}: {
  offers: ChatOffer[];
  events: DealEvent[];
  typing: "brand" | "creator" | null;
  fair: number;
  connecting: boolean;
  needsCall: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior: "smooth",
    });
  }, [offers.length, events.length, typing]);

  return (
    <div ref={ref} className="flex max-h-[620px] min-h-[420px] flex-col gap-5 overflow-y-auto px-5 py-6">
      {connecting && <p className="text-center text-sm text-tertiary">Setting up the campaign and both agents...</p>}
      {offers.map((o, i) => (
        <OfferBubble key={i} offer={o} fair={fair} />
      ))}
      {events.map((e) => (
        <EventRow key={e.status} event={e} needsCall={needsCall} />
      ))}
      {typing && <Typing from={typing} />}
    </div>
  );
}

function Speaker({ from }: { from: "brand" | "creator" }) {
  const Icon = from === "brand" ? Building02 : User01;
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-tertiary">
      <Icon className="size-3.5" />
      {from === "brand" ? "Brand agent" : "Creator agent"}
    </span>
  );
}

function OfferBubble({ offer, fair }: { offer: ChatOffer; fair: number }) {
  const mine = offer.from === "creator";
  const fairCash = fairFor(offer.deliverables, fair);
  const delta = fairCash ? Math.round(((offer.amount - fairCash) / fairCash) * 100) : 0;
  const what = describeDeliverables(offer.deliverables);
  return (
    <div className={cx("flex max-w-[85%] flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300", mine ? "items-end self-end" : "items-start")}>
      <div className="flex items-center gap-2">
        <Speaker from={offer.from} />
        <span className="text-xs text-quaternary">Round {offer.round}</span>
      </div>
      <div className={cx("space-y-1.5 rounded-xl px-4 py-3", mine ? "rounded-tr-sm bg-brand-solid" : "rounded-tl-sm bg-secondary")}>
        <div className="flex flex-wrap items-center gap-x-2">
          <span className={cx("text-lg font-semibold tabular-nums", mine ? "text-primary_on-brand" : "text-primary")}>{fmtUsd(offer.amount)}</span>
          <span className={cx("text-xs font-medium tabular-nums", mine ? "text-tertiary_on-brand" : "text-tertiary")}>
            cash, {delta === 0 ? `at fair price for ${what}` : `${delta > 0 ? "+" : ""}${delta}% vs fair for ${what}`}
          </span>
        </div>
        {offer.pkg || offer.deliverables.length ? (
          <PackageChips pkg={offer.pkg} deliverables={offer.deliverables} tone={mine ? "brand" : "gray"} />
        ) : (
          offer.extras.length > 0 && <p className={cx("text-xs font-medium", mine ? "text-secondary_on-brand" : "text-secondary")}>+ {offer.extras.join(", ")}</p>
        )}
        <p className={cx("text-sm", mine ? "text-tertiary_on-brand" : "text-secondary")}>{offer.message}</p>
      </div>
    </div>
  );
}

const EVENT_ICON: Partial<Record<DealStatus, typeof Check>> = {
  agreed: Check,
  held: Lock01,
  paid_out: BankNote01,
  refunded: CreditCard01,
  walked_away: XClose,
};

function EventRow({ event, needsCall }: { event: DealEvent; needsCall: boolean }) {
  const gap = needsCall && event.status === "walked_away";
  const Icon = gap ? AlertCircle : (EVENT_ICON[event.status] ?? Check);
  return (
    <div className="flex items-center gap-3 animate-in fade-in duration-300">
      <span className="h-px flex-1 bg-border-secondary" />
      <span
        className={cx(
          "flex items-center gap-1.5 text-center text-xs font-medium",
          gap ? "text-warning-primary" : event.status === "walked_away" ? "text-error-primary" : "text-brand-secondary",
        )}
      >
        <Icon className="size-4 shrink-0" />
        {event.text}
      </span>
      <span className="h-px flex-1 bg-border-secondary" />
    </div>
  );
}

function Typing({ from }: { from: "brand" | "creator" }) {
  return (
    <div className={cx("flex flex-col gap-1.5", from === "creator" ? "items-end self-end" : "items-start")}>
      <Speaker from={from} />
      <div className={cx("flex gap-1 rounded-xl px-4 py-3.5", from === "creator" ? "rounded-tr-sm bg-brand-solid" : "rounded-tl-sm bg-secondary")}>
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className={cx("size-1.5 animate-bounce rounded-full", from === "creator" ? "bg-white/70" : "bg-fg-quaternary")}
          />
        ))}
      </div>
    </div>
  );
}

function PriceCard({ offers, fair: fairReel, status, price }: { offers: ChatOffer[]; fair: number; status: DealStatus; price: number }) {
  const ds = offers[offers.length - 1]?.deliverables ?? [];
  const fair = fairFor(ds, fairReel);
  const opened = offers.find((o) => o.from === "brand")?.amount;
  const asked = offers.find((o) => o.from === "creator")?.amount;
  const locked = status !== "negotiating" && status !== "walked_away";
  const lo = Math.min(opened ?? fair, fair) * 0.9;
  const hi = Math.max(asked ?? fair, fair) * 1.1;
  const pos = (x: number) => `${Math.min(100, Math.max(0, ((x - lo) / (hi - lo || 1)) * 100))}%`;

  return (
    <div className={cx(card, "space-y-4 p-5")}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-md font-semibold text-primary">Price</h2>
        {locked && (
          <Badge size="sm" color="brand">
            Locked
          </Badge>
        )}
      </div>
      <div>
        <p className="text-sm text-tertiary">{locked ? "Agreed cash" : "Latest offer"}</p>
        <p className="text-display-xs font-semibold text-primary tabular-nums">{price ? fmtUsd(price) : "-"}</p>
      </div>
      <div className="space-y-2">
        <div className="relative h-2 rounded-full bg-quaternary">
          {opened !== undefined && asked !== undefined && (
            <div className="absolute inset-y-0 rounded-full bg-brand-secondary/30" style={{ left: pos(opened), right: `calc(100% - ${pos(asked)})` }} />
          )}
          <div className="absolute -inset-y-1 w-0.5 bg-fg-quaternary" style={{ left: pos(fair) }} />
          {price > 0 && (
            <div
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-solid ring-2 ring-white transition-all duration-500"
              style={{ left: pos(price) }}
            />
          )}
        </div>
        <div className="flex justify-between text-xs text-quaternary tabular-nums">
          <span>{fmtUsd(lo)}</span>
          <span>{fmtUsd(hi)}</span>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <Row label={`Fair for ${describeDeliverables(ds)} (from real views)`} value={fmtUsd(fair)} strong />
        <Row label="Brand opened" value={opened !== undefined ? fmtUsd(opened) : "-"} />
        <Row label="Creator asked" value={asked !== undefined ? fmtUsd(asked) : "-"} />
      </dl>
    </div>
  );
}

function Timeline({ status, needsCall }: { status: DealStatus; needsCall: boolean }) {
  const at = status === "refunded" ? 2 : status === "walked_away" ? 0 : STEPS.findIndex((s) => s.status === status);
  return (
    <div className={cx(card, "p-5")}>
      <h2 className="mb-4 text-md font-semibold text-primary">Timeline</h2>
      <ol>
        {STEPS.map((s, i) => {
          const done = i < at || status === "paid_out";
          const current = i === at && status !== "paid_out";
          const failed = current && status === "walked_away";
          return (
            <li key={s.status} className="relative flex gap-3 pb-5 last:pb-0">
              {i < STEPS.length - 1 && (
                <span className={cx("absolute top-7 left-3 h-[calc(100%-1.5rem)] w-px -translate-x-1/2", done ? "bg-brand-solid" : "bg-border-secondary")} />
              )}
              <span
                className={cx(
                  "relative flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                  done && "bg-brand-solid",
                  current && !failed && "ring-2 ring-brand ring-inset",
                  failed && "ring-2 ring-error ring-inset",
                  !done && !current && "ring-1 ring-secondary ring-inset",
                )}
              >
                {done && <Check className="size-3.5 text-white" />}
                {current && !failed && <span className="size-2 rounded-full bg-brand-solid" />}
                {failed && <XClose className="size-3.5 text-error-primary" />}
              </span>
              <div className="-mt-0.5">
                <p className={cx("text-sm font-semibold", done || current ? "text-primary" : "text-quaternary")}>
                  {failed ? (needsCall ? "Needs your call" : "No deal") : s.label}
                </p>
                <p className="text-xs text-tertiary">{failed ? (needsCall ? "Budgets do not overlap yet" : "The agents could not meet") : s.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-tertiary">{label}</dt>
      <dd className={cx("text-right tabular-nums", strong ? "font-semibold text-primary" : "text-secondary")}>{value}</dd>
    </div>
  );
}

function Action({ d, needsCall , perspective = "platform" }: { d: DealState; needsCall: boolean ; perspective?: Perspective }) {
  const full = "w-full";
  if (d.busy)
    return (
      <Button className={full} isLoading showTextWhileLoading>
        Talking to Stripe
      </Button>
    );
  switch (d.status) {
    case "negotiating":
      return (
        <Button className={full} color="secondary" isDisabled>
          Agents are negotiating
        </Button>
      );
    case "agreed":
      return <ApproveStep d={d} perspective={perspective} />;
    case "held":
      return (
        <div className="space-y-2">
          <Button className={full} iconLeading={CheckVerified01} onClick={d.markLive}>
            Mark post as live
          </Button>
          <p className="text-xs text-tertiary">Demo stand-in for the automatic post check. Releases the payout.</p>
        </div>
      );
    case "walked_away":
      if (needsCall) return <p className="text-sm text-tertiary">Pick one of the options in Needs your call to try again.</p>;
      return (
        <Button className={full} iconLeading={RefreshCw01} onClick={d.restart}>
          Negotiate again
        </Button>
      );
    default:
      return (
        <Button className={full} color="secondary" iconLeading={RefreshCw01} onClick={d.restart}>
          Run a new deal
        </Button>
      );
  }
}

function ApproveStep({ d, perspective }: { d: DealState; perspective: Perspective }) {
  const both = d.approvals.brand && d.approvals.creator;
  const autopay = d.autopay && perspective === "brand";
  // The creator only signs for themselves; the brand side shows as a status.
  const canAct = (side: "brand" | "creator") => perspective === "platform" || side === perspective;
  const sides: {
    side: "brand" | "creator";
    label: string;
    icon: typeof Building02;
  }[] = [
    { side: "brand", label: "Brand accepts", icon: Building02 },
    { side: "creator", label: "Creator accepts", icon: User01 },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-tertiary">
        {autopay ? "Your agent picked this creator and already accepted for you." : "Both humans sign off on the terms before any money moves."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {sides.map(({ side, label, icon }) =>
          d.approvals[side] ? (
            <span
              key={side}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-success-secondary px-3 py-2 text-sm font-semibold text-success-primary ring-1 ring-success ring-inset animate-in fade-in duration-200"
            >
              <Check className="size-4" />
              {side === "brand" ? "Brand" : "Creator"} accepted
            </span>
          ) : canAct(side) ? (
            <Button key={side} size="sm" color={perspective === "creator" ? "primary" : "secondary"} iconLeading={icon} onClick={() => d.approve(side)}>
              {perspective === "creator" ? "Accept this deal" : label}
            </Button>
          ) : (
            <span key={side} className="flex items-center justify-center rounded-lg px-3 py-2 text-sm text-tertiary ring-1 ring-secondary ring-inset">
              Waiting for {side}
            </span>
          ),
        )}
      </div>
      {perspective === "brand" && !d.approvals.creator && (
        <Button className="w-full" size="sm" color="secondary" iconLeading={User01} onClick={() => d.approve("creator")}>
          Accept as creator (demo)
        </Button>
      )}
      {autopay && !(both && d.error) ? (
        <p className="text-xs text-tertiary">
          {both ? "The creator accepted. Your agent is paying with Stripe now." : "Your agent pays automatically as soon as the creator accepts."}
        </p>
      ) : both && perspective === "creator" ? (
        <p className="text-xs text-tertiary">Both accepted. The brand pays next, and Stripe holds the money until your post is live.</p>
      ) : both ? (
        <Button className="w-full" iconLeading={CreditCard01} onClick={d.pay}>
          Pay {fmtUsd(d.price)} with Stripe
        </Button>
      ) : (
        <p className="text-xs text-quaternary">Payment unlocks once both sides accept.</p>
      )}
    </div>
  );
}
