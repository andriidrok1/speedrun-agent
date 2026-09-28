"use client";

import { AlertCircle, CurrencyDollar, Minus } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

export const GAP_HINTS = {
  trim: "Starting a fresh round. Tip: ask for fewer stories or a single reel so the creator's minimum drops.",
  raise: "Starting a fresh round. Tip: raise the campaign budget before the agents talk again.",
};

/** "Needs your call": the agents found no overlap, so the humans pick how to close the gap. */
export function GapCard({ brandMax, creatorMin, gap, onPick }: { brandMax?: number; creatorMin?: number; gap?: number; onPick: (k: keyof typeof GAP_HINTS) => void }) {
  const g = gap ?? (brandMax !== undefined && creatorMin !== undefined ? Math.max(0, creatorMin - brandMax) : undefined);
  const lo = brandMax ?? (creatorMin !== undefined && g !== undefined ? creatorMin - g : undefined);
  const hi = creatorMin ?? (brandMax !== undefined && g !== undefined ? brandMax + g : undefined);
  const scale = hi ? hi * 1.05 : 1;
  const pct = (v: number) => `${Math.max(4, (v / scale) * 100)}%`;

  return (
    <div className={cx(card, "space-y-4 p-5 ring-warning")}>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-secondary">
          <AlertCircle className="size-4 text-fg-warning-primary" />
        </span>
        <div>
          <h2 className="text-md font-semibold text-primary">Needs your call</h2>
          <p className="text-sm text-tertiary">
            The agents could not find a price both sides accept
            {g !== undefined ? `. They are ${fmtUsd(g)} apart on cash.` : "."}
          </p>
        </div>
      </div>

      {lo !== undefined && hi !== undefined && g !== undefined && (
        <div className="space-y-3">
          <Bar label="Brand can pay (best offer)" value={lo} width={pct(lo)} color="bg-fg-secondary" />
          <div className="relative h-5">
            <div
              className="absolute inset-y-0 border-x-2 border-dashed border-fg-warning-primary bg-warning-secondary"
              style={{
                left: pct(lo),
                width: `calc(${pct(hi)} - ${pct(lo)})`,
                minWidth: 8,
              }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 text-xs font-semibold whitespace-nowrap text-warning-primary tabular-nums"
              style={{ right: `calc(100% - ${pct(lo)} + 8px)` }}
            >
              Gap {fmtUsd(g)}
            </span>
          </div>
          <Bar label="Creator needs (minimum)" value={hi} width={pct(hi)} color="bg-brand-solid" />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Button color="secondary" iconLeading={Minus} onClick={() => onPick("trim")}>
          Try with fewer deliverables
        </Button>
        <Button iconLeading={CurrencyDollar} onClick={() => onPick("raise")}>
          Raise budget
        </Button>
      </div>
    </div>
  );
}

function Bar({ label, value, width, color }: { label: string; value: number; width: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-xs">
        <span className="text-tertiary">{label}</span>
        <span className="font-semibold text-primary tabular-nums">{fmtUsd(value)}</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-secondary">
        <div className={cx("h-full rounded-full transition-all duration-500", color)} style={{ width }} />
      </div>
    </div>
  );
}
