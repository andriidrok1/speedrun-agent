import { getCreators } from "@/lib/creators";
import { Inbox } from "./inbox";

export const dynamic = "force-dynamic";

export default function CreatorInboxPage() {
  return <Inbox creators={getCreators().creators} />;
}
