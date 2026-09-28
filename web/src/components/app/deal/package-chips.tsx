import type { FC } from "react";
import { CurrencyDollar, Film01, Gift01, Percent01, ShoppingBag01 } from "@untitledui/icons";
import type { ServerDeliverable, ServerPackage } from "@/lib/deals/api";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";
import { DELIVERABLE_ICON, deliverableLabel } from "./deal-math";

type Tone = "gray" | "brand";

function Chip({ icon: Icon, children, tone, strong }: { icon: FC<{ className?: string }>; children: React.ReactNode; tone: Tone; strong?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset",
        tone === "brand" ? "bg-white/15 text-white ring-white/25" : "bg-primary text-secondary ring-secondary",
        strong && (tone === "brand" ? "bg-white/25" : "text-primary"),
      )}
    >
      <Icon className={cx("size-3.5 shrink-0", tone === "brand" ? "text-white/80" : "text-fg-quaternary")} />
      {children}
    </span>
  );
}

/** Compact visual of one offer: what gets made, then what the creator gets for it. */
export function PackageChips({ pkg, deliverables, tone }: { pkg?: ServerPackage; deliverables: ServerDeliverable[]; tone: Tone }) {
  const perks = [...(pkg && pkg.store_credit_usd > 0 ? [`${fmtUsd(pkg.store_credit_usd)} store credit`] : []), ...(pkg?.custom ?? [])];
  return (
    <div className="space-y-1.5">
      {deliverables.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deliverables.map((d, i) => (
            <Chip key={i} icon={DELIVERABLE_ICON[d.type] ?? Film01} tone={tone} strong>
              {deliverableLabel(d)}
            </Chip>
          ))}
        </div>
      )}
      {pkg && (
        <div className="flex flex-wrap gap-1">
          <Chip icon={CurrencyDollar} tone={tone}>
            {fmtUsd(pkg.cash_usd)} cash
          </Chip>
          {pkg.product.map((p, i) => (
            <Chip key={i} icon={ShoppingBag01} tone={tone}>
              {p.qty} x {p.sku}
            </Chip>
          ))}
          {pkg.affiliate_pct > 0 && (
            <Chip icon={Percent01} tone={tone}>
              {pkg.affiliate_pct}% affiliate
            </Chip>
          )}
          {perks.map((p, i) => (
            <Chip key={i} icon={Gift01} tone={tone}>
              {p}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
