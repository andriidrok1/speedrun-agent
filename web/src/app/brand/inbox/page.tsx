import { getCreators } from "@/lib/creators";
import { BrandInbox } from "./brand-inbox";

export const dynamic = "force-dynamic";

export default async function BrandInboxPage({ searchParams }: { searchParams: Promise<{ launch?: string }> }) {
  const { launch } = await searchParams;
  return <BrandInbox creators={getCreators().creators} autoLaunch={launch === "1"} />;
}
