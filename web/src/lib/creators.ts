import fs from "node:fs";
import path from "node:path";
import type { Creator } from "@shared/contract";

// Real data comes from `npm run scrape` (data/creators.json).
// Until that file exists, the screens use data/fake-creators.json.
export function getCreators(): { creators: Creator[]; source: "apify" | "fake" } {
  const dir = path.join(process.cwd(), "data");
  const real = path.join(dir, "creators.json");
  if (fs.existsSync(real)) {
    return { creators: JSON.parse(fs.readFileSync(real, "utf8")), source: "apify" };
  }
  return {
    creators: JSON.parse(fs.readFileSync(path.join(dir, "fake-creators.json"), "utf8")),
    source: "fake",
  };
}
