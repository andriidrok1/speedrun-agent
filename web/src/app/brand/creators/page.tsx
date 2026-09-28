import { BadgeWithDot } from "@/components/base/badges/badges";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { PageHeader } from "@/components/app/page-header";
import { getCreators } from "@/lib/creators";
import { fmtUsd } from "@/lib/format";
import { CreatorsTable } from "./creators-table";

// Hardcoded until /brand/setup exists
const BUDGET = 20_000;

export const dynamic = "force-dynamic";

export default function CreatorsPage() {
  const { creators, source } = getCreators();
  const total = creators.reduce((s, c) => s + c.fairPrice, 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <PageHeader
        title="Find creators"
        description="Real public data, priced on views instead of followers."
        actions={
          <BadgeWithDot color={source === "apify" ? "gray" : "warning"} size="md">
            {source === "apify" ? "Live data from Apify" : "Fake data: run npm run scrape"}
          </BadgeWithDot>
        }
      />

      <div className="space-y-3 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-md font-semibold text-primary">Budget</h2>
          <p className="text-sm text-tertiary">
            Fair price for all {creators.length} creators is{" "}
            <span className="font-semibold text-primary">{fmtUsd(total)}</span> of your {fmtUsd(BUDGET)}
          </p>
        </div>
        <ProgressBar value={Math.min(100, (total / BUDGET) * 100)} />
      </div>

      <CreatorsTable creators={creators} />
    </main>
  );
}
