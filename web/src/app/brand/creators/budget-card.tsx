"use client";

import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { Button } from "@/components/base/buttons/button";
import { useSavedBrand } from "@/lib/onboarding/store";
import { fmtUsd } from "@/lib/format";

/** Budget from brand onboarding (falls back to the demo campaign when nothing is saved). */
export function BudgetCard({ fairTotal, count }: { fairTotal: number; count: number }) {
  const brand = useSavedBrand() ?? null;
  const budget = brand?.totalBudget ?? 20_000;
  const slots = brand?.creators ?? 5;

  return (
    <div className="space-y-3 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-primary">{brand ? `${brand.name}: ${brand.campaignName}` : "Demo campaign (Marine Layer)"}</h2>
          <p className="text-sm text-tertiary">
            {fmtUsd(budget)} for {slots} creators, about {fmtUsd(budget / Math.max(1, slots))} each. Fair price for all {count} found is{" "}
            <span className="font-semibold text-primary">{fmtUsd(fairTotal)}</span>.
          </p>
        </div>
        <Button href="/brand/setup" size="sm" color="secondary">
          {brand ? "Edit campaign" : "Set up your campaign"}
        </Button>
      </div>
      <ProgressBar value={Math.min(100, (fairTotal / budget) * 100)} />
    </div>
  );
}
