import { notFound } from "next/navigation";
import { getCreators } from "@/lib/creators";
import { DealView } from "./deal-view";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creator = getCreators().creators.find((c) => c.handle.replace("@", "") === decodeURIComponent(id));
  if (!creator) notFound();
  return <DealView creator={creator} />;
}
