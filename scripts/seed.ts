// Demo reset + warm-up: creates a fresh campaign for a brand and prints the ids the UI needs.
//   cd server && npx tsx ../scripts/seed.ts [--base http://localhost:8787] [--brand marine-layer] [--creator maya-wears] [--run]
// --run also creates one deal and polls it to a terminal status, so the demo starts with a known-good state.
const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:8787');
const BRAND = opt('--brand', 'marine-layer');
const CREATOR = opt('--creator', 'maya-wears');
const RUN = args.includes('--run');

async function api(path: string, body?: unknown) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j as Record<string, any>;
}

async function main() {
  const h = await api('/health');
  console.log(`health ok (${h.service})`);
  const c = await api('/campaigns', { brandSlug: BRAND });
  console.log(`campaign ${c.campaignId}  brand=${BRAND}  budget=${c.budgetTotal}`);
  if (!RUN) { console.log(`\nnext: curl -X POST ${BASE}/deals -H 'content-type: application/json' -d '{"campaignId":"${c.campaignId}","creatorSlug":"${CREATOR}"}'`); return; }
  const d = await api('/deals', { campaignId: c.campaignId, creatorSlug: CREATOR });
  console.log(`deal ${d.dealId}  status=${d.status}`);
  const t0 = Date.now();
  for (;;) {
    const cur = await api(`/deals/${d.dealId}`);
    const last = cur.turns.at(-1);
    console.log(`  t+${Math.round((Date.now() - t0) / 1000)}s ${cur.status} turns=${cur.turns.length}` + (last ? `  last: ${last.from} $${last.package.cash_usd} ${last.status}` : ''));
    if (cur.status !== 'negotiating') { console.log(`\nresult: ${cur.status} price=${cur.price} budgetLeft=${cur.budgetLeft}`); break; }
    await new Promise((r) => setTimeout(r, 3000));
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
