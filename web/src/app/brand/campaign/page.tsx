import { PageHeader } from "@/components/app/page-header";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { getCreators } from "@/lib/creators";
import { CampaignRunner } from "./campaign-runner";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  const { creators, source } = getCreators();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <PageHeader
        title="Run campaign with Brainbase"
        description="A Brainbase agent picks creators, negotiates, funds and verifies, and you watch every step."
        actions={
          <BadgeWithDot color="brand" size="md">
            Brainbase manager agent
          </BadgeWithDot>
        }
      />
      <CampaignRunner creators={creators} source={source} initialTaskId={task ?? null} />
    </main>
  );
}
