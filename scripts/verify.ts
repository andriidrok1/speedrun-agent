// Manual check of the live-post verifier.
// Usage: cd server && npx tsx ../scripts/verify.ts <url> [--handle "@marinelayer"] [--mock]
// Reads server/.dev.vars (KEY=VALUE lines) for BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPostLive, mockVerify } from '../server/src/verify';

const here = dirname(fileURLToPath(import.meta.url));
const devVarsPath = resolve(here, '../server/.dev.vars');

function loadDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const args = process.argv.slice(2);
const url = args.find((a: string) => !a.startsWith('--'));
if (!url) {
  console.error('usage: npx tsx ../scripts/verify.ts <url> [--handle "@marinelayer"] [--mock]');
  process.exit(2);
}
const handleIdx = args.indexOf('--handle');
const requiredTag = handleIdx >= 0 ? args[handleIdx + 1] : undefined;

if (args.includes('--mock')) {
  console.log(JSON.stringify(mockVerify(url), null, 2));
  process.exit(0);
}

const vars = { ...loadDevVars(devVarsPath), ...process.env } as Record<string, string | undefined>;
const apiKey = vars.BROWSERBASE_API_KEY;
const browserbase = apiKey ? { apiKey, projectId: vars.BROWSERBASE_PROJECT_ID } : undefined;
console.error(`[verify] url=${url} tag=${requiredTag ?? '-'} browserbase=${browserbase ? 'yes' : 'no (no BROWSERBASE_API_KEY)'}`);

verifyPostLive({ url, requiredTag, browserbase }).then((result) => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.verified ? 0 : 1);
});
