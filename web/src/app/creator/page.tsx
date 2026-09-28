import { getCreators } from "@/lib/creators";
import { CreatorSetup } from "./creator-setup";

export const dynamic = "force-dynamic";

export default function CreatorPage() {
  return <CreatorSetup creators={getCreators().creators} />;
}
