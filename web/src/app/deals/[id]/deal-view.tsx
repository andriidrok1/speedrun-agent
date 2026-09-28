"use client";

import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  BankNote01,
  Building02,
  Check,
  CheckVerified01,
  CreditCard01,
  Lock01,
  RefreshCw01,
  User01,
} from "@untitledui/icons";
import type { Creator, DealStatus } from "@shared/contract";
import { AvatarLabelGroup } from "@/components/base/avatar/avatar-label-group";
import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { type DealRules } from "@/lib/deals/negotiate";
import { type FeedItem, PLATFORM_FEE, useDeal } from "@/lib/deals/use-deal";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";

const STEPS: { status: DealStatus; label: string; hint: string }[] = [
  { status: "negotiating", label: "Negotiating", hint: "Agents trade offers" },
  { status: "agreed", label: "Agreed", hint: "Price is locked" },
  { status: "paid", label: "Paid", hint: "Brand pays with Stripe" },
  { status: "held", label: "Held", hint: "Stripe holds the money" },
  { status: "live", label: "Post live", hint: "Post is verified" },
  { status: "paid_out", label: "Paid out", hint: "Creator gets paid" },
];

const STATUS_LABEL: Record<DealStatus, string> = {
  negotiating: "Negotiating",
  agreed: "Agreed",
  paid: "Paid",
  held: "Funds held",
  live: "Post live",
  paid_out: "Paid out",
  refunded: "Refunded",
};

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

export function DealView({ creator, dealId }: { creator: Creator; dealId: string }) {
  const { deal, rules, feed, latest, typing, pay, markLive, releasePayout, replay } = useDeal(creator, dealId);
  const platform = creator.platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Button href="/brand/creators" color="link-gray" size="sm" iconLeading={ArrowLeft}>
        All creators
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <AvatarLabelGroup
          size="lg"
          src={creator.avatarUrl}
          initials={(creator.name ?? creator.handle).replace("@", "").slice(0, 2).toUpperCase()}
          alt=""
          title={creator.name ?? creator.handle}
          subtitle={`${creator.handle} on ${platform}`}
        />
        <BadgeWithDot size="lg" color={deal.status === "paid_out" ? "success" : "gray"}>
          {STATUS_LABEL[deal.status]}
        </BadgeWithDot>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className={card}>
          <div className="flex items-start justify-between gap-4 border-b border-secondary px-5 py-4">
            <div>
              <h2 className="text-md font-semibold text-primary">Live negotiation</h2>
              <p className="text-sm text-tertiary">Brand agent and creator agent, both working from the same data.</p>
            </div>
            <Button size="sm" color="secondary" iconLeading={RefreshCw01} onClick={replay}>
              Replay
            </Button>
          </div>
          <Feed feed={feed} typing={typing} fair={rules.fair} />
        </section>

        <aside className="space-y-6">
          <PriceCard rules={rules} current={latest?.amount} agreed={deal.status !== "negotiating" ? deal.price : undefined} />
          <Timeline status={deal.status} />
          <div className={cx(card, "space-y-4 p-5")}>
            <h2 className="text-md font-semibold text-primary">Terms</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Deliverables" value="1 reel + 1 story" />
              <Row label="Deadline" value="7 days after payment" />
              <Row label="Platform fee" value={`${PLATFORM_FEE * 100}%`} />
              <Row label="Creator gets" value={deal.price ? fmtUsd(Math.round(deal.price * (1 - PLATFORM_FEE))) : "-"} />
              <Row label="Budget left" value={fmtUsd(deal.budgetLeft)} />
            </dl>
            <Action status={deal.status} price={deal.price} onPay={pay} onLive={markLive} onRelease={releasePayout} onReplay={replay} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Feed({ feed, typing, fair }: { feed: FeedItem[]; typing: "brand" | "creator" | null; fair: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [feed.length, typing]);

  return (
    <div ref={ref} className="flex max-h-[620px] min-h-[420px] flex-col gap-5 overflow-y-auto px-5 py-6">
      {feed.map((item, i) =>
        item.kind === "offer" ? (
          <OfferBubble key={i} from={item.offer.from} amount={item.offer.amount} message={item.offer.message} round={item.round} fair={fair} />
        ) : (
          <EventRow key={i} status={item.status} text={item.text} />
        ),
      )}
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

function OfferBubble({ from, amount, message, round, fair }: { from: "brand" | "creator"; amount: number; message: string; round: number; fair: number }) {
  const mine = from === "creator";
  const delta = Math.round(((amount - fair) / fair) * 100);
  return (
    <div className={cx("flex max-w-[85%] flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300", mine ? "items-end self-end" : "items-start")}>
      <div className="flex items-center gap-2">
        <Speaker from={from} />
        <span className="text-xs text-quaternary">Round {round}</span>
      </div>
      <div className={cx("space-y-1.5 rounded-xl px-4 py-3", mine ? "rounded-tr-sm bg-primary-solid" : "rounded-tl-sm bg-secondary")}>
        <div className="flex items-center gap-2">
          <span className={cx("text-lg font-semibold tabular-nums", mine ? "text-primary_on-brand" : "text-primary")}>{fmtUsd(amount)}</span>
          <span className={cx("text-xs font-medium tabular-nums", mine ? "text-tertiary_on-brand" : "text-tertiary")}>
            {delta === 0 ? "at fair price" : `${delta > 0 ? "+" : ""}${delta}% vs fair`}
          </span>
        </div>
        <p className={cx("text-sm", mine ? "text-tertiary_on-brand" : "text-secondary")}>{message}</p>
      </div>
    </div>
  );
}

const EVENT_ICON: Partial<Record<DealStatus, typeof Check>> = {
  agreed: Check,
  paid: CreditCard01,
  held: Lock01,
  live: CheckVerified01,
  paid_out: BankNote01,
};

function EventRow({ status, text }: { status: DealStatus; text: string }) {
  const Icon = EVENT_ICON[status] ?? Check;
  return (
    <div className="flex items-center gap-3 animate-in fade-in duration-300">
      <span className="h-px flex-1 bg-border-secondary" />
      <span className="flex items-center gap-1.5 text-center text-xs font-medium text-secondary">
        <Icon className="size-4 shrink-0" />
        {text}
      </span>
      <span className="h-px flex-1 bg-border-secondary" />
    </div>
  );
}

function Typing({ from }: { from: "brand" | "creator" }) {
  return (
    <div className={cx("flex flex-col gap-1.5", from === "creator" ? "items-end self-end" : "items-start")}>
      <Speaker from={from} />
      <div className={cx("flex gap-1 rounded-xl px-4 py-3.5", from === "creator" ? "rounded-tr-sm bg-primary-solid" : "rounded-tl-sm bg-secondary")}>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            style={{ animationDelay: `${d}ms` }}
            className={cx("size-1.5 animate-bounce rounded-full", from === "creator" ? "bg-white/70" : "bg-fg-quaternary")}
          />
        ))}
      </div>
    </div>
  );
}

function PriceCard({ rules, current, agreed }: { rules: DealRules; current?: number; agreed?: number }) {
  const min = rules.brandOpen;
  const max = rules.ceiling;
  const pos = (x: number) => `${Math.min(100, Math.max(0, ((x - min) / (max - min)) * 100))}%`;
  const value = agreed ?? current;

  return (
    <div className={cx(card, "space-y-4 p-5")}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-md font-semibold text-primary">Price</h2>
        {agreed ? <Badge size="sm" color="gray">Locked</Badge> : null}
      </div>
      <div>
        <p className="text-sm text-tertiary">{agreed ? "Agreed price" : "Latest offer"}</p>
        <p className="text-display-xs font-semibold text-primary tabular-nums">{value ? fmtUsd(value) : "-"}</p>
      </div>
      <div className="space-y-2">
        <div className="relative h-2 rounded-full bg-quaternary">
          <div className="absolute inset-y-0 rounded-full bg-fg-quaternary/40" style={{ left: pos(rules.floor), right: `calc(100% - ${pos(rules.ceiling)})` }} />
          <div className="absolute -inset-y-1 w-0.5 bg-fg-quaternary" style={{ left: pos(rules.fair) }} />
          {value ? (
            <div
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-solid ring-2 ring-white transition-all duration-500"
              style={{ left: pos(value) }}
            />
          ) : null}
        </div>
        <div className="flex justify-between text-xs text-quaternary tabular-nums">
          <span>{fmtUsd(min)}</span>
          <span>{fmtUsd(max)}</span>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <Row label="Fair price" value={fmtUsd(rules.fair)} strong />
        <Row label="Creator floor" value={fmtUsd(rules.floor)} />
        <Row label="Brand ceiling" value={fmtUsd(rules.ceiling)} />
      </dl>
    </div>
  );
}

function Timeline({ status }: { status: DealStatus }) {
  const at = STEPS.findIndex((s) => s.status === status);
  return (
    <div className={cx(card, "p-5")}>
      <h2 className="mb-4 text-md font-semibold text-primary">Timeline</h2>
      <ol>
        {STEPS.map((s, i) => {
          const done = i < at || status === "paid_out";
          const current = i === at && status !== "paid_out";
          return (
            <li key={s.status} className="relative flex gap-3 pb-5 last:pb-0">
              {i < STEPS.length - 1 && (
                <span className={cx("absolute top-7 left-3 h-[calc(100%-1.5rem)] w-px -translate-x-1/2", done ? "bg-primary-solid" : "bg-border-secondary")} />
              )}
              <span
                className={cx(
                  "relative flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                  done && "bg-primary-solid",
                  current && "ring-2 ring-fg-primary ring-inset",
                  !done && !current && "ring-1 ring-secondary ring-inset",
                )}
              >
                {done && <Check className="size-3.5 text-white" />}
                {current && <span className="size-2 rounded-full bg-primary-solid" />}
              </span>
              <div className="-mt-0.5">
                <p className={cx("text-sm font-semibold", done || current ? "text-primary" : "text-quaternary")}>{s.label}</p>
                <p className="text-xs text-tertiary">{s.hint}</p>
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
      <dd className={cx("tabular-nums", strong ? "font-semibold text-primary" : "text-secondary")}>{value}</dd>
    </div>
  );
}

function Action(props: { status: DealStatus; price: number; onPay: () => void; onLive: () => void; onRelease: () => void; onReplay: () => void }) {
  const full = "w-full";
  switch (props.status) {
    case "negotiating":
      return <Button className={full} color="secondary" isDisabled>Waiting for agreement</Button>;
    case "agreed":
      return <Button className={full} iconLeading={CreditCard01} onClick={props.onPay}>Pay {fmtUsd(props.price)} with Stripe</Button>;
    case "paid":
      return <Button className={full} isLoading showTextWhileLoading>Confirming payment</Button>;
    case "held":
      return (
        <div className="space-y-2">
          <Button className={full} iconLeading={CheckVerified01} onClick={props.onLive}>Mark post as live</Button>
          <p className="text-xs text-tertiary">Stands in for the automatic post check.</p>
        </div>
      );
    case "live":
      return <Button className={full} iconLeading={BankNote01} onClick={props.onRelease}>Release payout</Button>;
    default:
      return <Button className={full} color="secondary" iconLeading={RefreshCw01} onClick={props.onReplay}>Run it again</Button>;
  }
}
