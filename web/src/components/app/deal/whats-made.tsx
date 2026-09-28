import { Calendar, Clock, Film01, Shield01 } from "@untitledui/icons";
import type { ChatOffer } from "@/lib/deals/use-deal";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";
import { DELIVERABLE_ICON, cashShares, deliverableLabel, packageMix } from "./deal-math";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

const USAGE: Record<string, string> = {
  organic_only: "Organic only",
  paid_ads_30d: "Paid ads, 30 days",
  paid_ads_90d: "Paid ads, 90 days",
  perpetual: "Perpetual",
};

const SEGMENTS = [
  { key: "cash", label: "Cash", color: "bg-brand-solid" },
  { key: "products", label: "Products", color: "bg-utility-orange-500" },
  {
    key: "affiliate",
    label: "Affiliate (est.)",
    color: "bg-utility-green-500",
  },
  { key: "perks", label: "Perks", color: "bg-utility-purple-500" },
] as const;

function fmtDate(iso?: string) {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WhatsMade({ offer, locked }: { offer?: ChatOffer; locked: boolean }) {
  if (!offer) {
    return (
      <div className={cx(card, "space-y-2 p-5")}>
        <h2 className="text-md font-semibold text-primary">What&apos;s being made</h2>
        <p className="text-sm text-tertiary">Appears after the first offer.</p>
      </div>
    );
  }
  const ds = offer.deliverables;
  const cash = offer.pkg?.cash_usd ?? offer.amount;
  const shares = cashShares(ds, cash);
  const mix = offer.pkg ? packageMix(offer.pkg, offer.valueForCreator) : { cash, products: 0, affiliate: 0, perks: 0 };
  const total = mix.cash + mix.products + mix.affiliate + mix.perks || 1;
  const parts = SEGMENTS.filter((s) => mix[s.key] > 0);

  return (
    <div className={cx(card, "space-y-4 p-5")}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-md font-semibold text-primary">What&apos;s being made</h2>
        <span className="text-xs text-tertiary">{locked ? "Agreed terms" : `Latest, round ${offer.round}`}</span>
      </div>

      {ds.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {ds.map((d, i) => {
            const Icon = DELIVERABLE_ICON[d.type] ?? Film01;
            return (
              <li key={i} className="space-y-1.5 rounded-lg bg-secondary p-3">
                <span className="flex size-7 items-center justify-center rounded-md bg-primary ring-1 ring-secondary ring-inset">
                  <Icon className="size-4 text-fg-brand-primary" />
                </span>
                <p className="text-sm font-semibold text-primary">{deliverableLabel(d)}</p>
                {d.notes && <p className="text-xs text-tertiary">{d.notes}</p>}
                <p className="text-xs text-tertiary tabular-nums">{fmtUsd(shares[i])} of cash</p>
              </li>
            );
          })}
        </ul>
      )}

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Fact icon={Shield01} label="Usage" value={offer.usageRights ? (USAGE[offer.usageRights] ?? offer.usageRights) : "-"} />
        <Fact icon={Clock} label="Exclusive" value={offer.exclusivity ? (offer.exclusivity.days > 0 ? `${offer.exclusivity.days} days` : "None") : "-"} />
        <Fact icon={Calendar} label="Due" value={fmtDate(offer.deadline)} />
      </dl>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-secondary">Package value</span>
          <span className="font-semibold text-primary tabular-nums">{fmtUsd(total)}</span>
        </div>
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${fmtUsd(mix[p.key])}`).join(", ")}>
          {parts.map((p) => (
            <div
              key={p.key}
              className={cx("h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full", p.color)}
              style={{ width: `${(mix[p.key] / total) * 100}%` }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5 text-tertiary">
              <span className={cx("size-2 rounded-sm", p.color)} />
              {p.label}
              <span className="font-medium text-secondary tabular-nums">
                {fmtUsd(mix[p.key])} ({Math.round((mix[p.key] / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
        {offer.pkg && offer.pkg.affiliate_pct > 0 && mix.affiliate === 0 && (
          <p className="text-xs text-quaternary">Plus {offer.pkg.affiliate_pct}% affiliate on sales, not counted above.</p>
        )}
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="space-y-0.5 rounded-lg p-2 ring-1 ring-secondary ring-inset">
      <dt className="flex items-center gap-1 text-quaternary">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className="font-medium text-primary">{value}</dd>
    </div>
  );
}
