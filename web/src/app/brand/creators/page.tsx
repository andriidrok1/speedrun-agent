import { BadgeWithDot } from "@/components/base/badges/badges";
import { PageHeader } from "@/components/app/page-header";
import { getCreators } from "@/lib/creators";
import { BudgetCard } from "./budget-card";
import { CreatorsTable } from "./creators-table";

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

      <BudgetCard fairTotal={total} count={creators.length} />

      <CreatorsTable creators={creators} />
    </main>
  );
}
