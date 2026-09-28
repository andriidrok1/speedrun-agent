// Market layer demo: two campaigns, four creators, both-side rankings, then the match.
//   cd server && npx tsx ../scripts/market-demo.ts [--base http://localhost:8787] [--skip-negotiate <A,B>] [--headcount 2]
// --skip-negotiate reuses existing campaign ids (deals already negotiated) and only runs the evaluation + match.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:8787');
const SKIP = opt('--skip-negotiate', '');
const HEADCOUNT = Number(opt('--headcount', '2'));
const HERE = dirname(fileURLToPath(import.meta.url));

type Row = Record<string, any>;
async function api(path: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<{ status: number; json: Row }> {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json()) as Row };
}
async function must(path: string, body?: unknown): Promise<Row> {
  const { status, json } = await api(path, body);
  if (status >= 400) throw new Error(`${path} -> ${status} ${JSON.stringify(json)}`);
  return json;
}
const usd = (n: unknown) => (typeof n === 'number' ? `$${Math.round(n)}` : '-');
const short = (id: string) => id.slice(0, 8);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function table(rows: Record<string, string>[]): void {
  if (rows.length === 0) { console.log('  (no rows)'); return; }
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => r[c].length)));
  const line = (vals: string[]) => '  ' + vals.map((v, i) => v.padEnd(w[i])).join('  ');
  console.log(line(cols)); console.log(line(w.map((n) => '-'.repeat(n))));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}

async function main() {
  const h = await must('/health');
  console.log(`health ok (${h.service})`);

  let A: string, B: string;
  if (SKIP) {
    [A, B] = SKIP.split(',').map((s) => s.trim());
    if (!A || !B) throw new Error('--skip-negotiate needs "<A>,<B>"');
    console.log(`reusing campaigns A=${A} B=${B}`);
  } else {
    const scraped: Row[] = JSON.parse(readFileSync(join(HERE, '..', 'web', 'data', 'creators.json'), 'utf8'));
    const rec = (handle: string) => {
      const r = scraped.find((c) => c.handle === handle);
      if (!r) throw new Error(`no ${handle} in web/data/creators.json`);
      const { handle: hd, platform, followers, avgViews30d, engagement, fairPrice } = r;
      return { slug: handle.replace(/^@/, ''), creator: { handle: hd, platform, followers, avgViews30d, engagement, fairPrice } };
    };
    const ca = await must('/campaigns', { brandSlug: 'marine-layer', budgetUsd: 8000 });
    const cb = await must('/campaigns', { brandSlug: 'temescal-hair' });
    A = ca.campaignId; B = cb.campaignId;
    console.log(`campaign A ${A} marine-layer budget=${ca.budgetTotal}`);
    console.log(`campaign B ${B} temescal-hair budget=${cb.budgetTotal}`);

    const starts: { campaignId: string; creatorSlug: string; creator?: unknown }[] = [
      { campaignId: A, creatorSlug: 'maya-wears' },
      ...['@realrobertgutierrez', '@sayatnokerban', '@bitterbuilds'].map((hd) => { const r = rec(hd); return { campaignId: A, creatorSlug: r.slug, creator: r.creator }; }),
      { campaignId: B, creatorSlug: 'maya-wears' },
    ];
    const deals: Row[] = [];
    for (const s of starts) {
      const d = await must('/deals', s);
      deals.push(d);
      console.log(`deal ${short(d.dealId)} ${s.campaignId === A ? 'A' : 'B'} x ${s.creatorSlug}: ${d.status}`);
    }
    const t0 = Date.now();
    for (;;) {
      const cur = await Promise.all(deals.map((d) => must(`/deals/${d.dealId}`)));
      const line = cur.map((d) => `${d.creatorSlug}=${d.status}${d.status === 'negotiating' ? `(${d.turns.length}t)` : ''}`).join('  ');
      console.log(`  t+${Math.round((Date.now() - t0) / 1000)}s  ${line}`);
      if (cur.every((d) => d.status !== 'negotiating')) {
        for (const d of cur) console.log(`  ${short(d.dealId)} ${d.brandSlug} x ${d.creatorSlug}: ${d.status} cash=${usd(d.price)}${d.walkReason ? ` (${d.walkReason})` : ''}`);
        break;
      }
      await sleep(5000);
    }
  }

  for (const [label, id] of [['A', A], ['B', B]] as const) {
    const ev = await must(`/campaigns/${id}/evaluation`);
    console.log(`\nbrand evaluation ${label} (${ev.brandSlug}, budgetLeft=${usd(ev.budgetLeft)})`);
    table(ev.ranked.map((r: Row) => ({ rank: String(r.rank), deal: short(r.dealId), creator: r.creatorSlug, cash: usd(r.cash_usd), value: usd(r.value_usd), surplus: usd(r.surplus_usd), cpm: r.implied_cpm_usd == null ? '-' : `$${r.implied_cpm_usd}` })));
  }
  const cev = await must('/creators/maya-wears/evaluation');
  console.log(`\ncreator evaluation maya-wears`);
  table(cev.ranked.map((r: Row) => ({ rank: String(r.rank), deal: short(r.dealId), brand: r.brandSlug, campaign: short(r.campaignId), cash: usd(r.cash_usd), value: usd(r.value_usd), surplus: usd(r.surplus_usd) })));

  const m = await must('/market/match', { campaignIds: [A, B], headcount: HEADCOUNT });
  console.log(`\nmarket match (headcount ${HEADCOUNT}): selected ${m.selected.length}, not_selected ${m.not_selected.length}`);
  const all: string[] = [...m.selected, ...m.not_selected];
  const details = await Promise.all(all.map((id) => must(`/deals/${id}`)));
  table(details.map((d) => ({
    deal: short(d.dealId), brand: d.brandSlug, creator: d.creatorSlug, cash: usd(d.price),
    'brand rank': String(d.ranks?.brand ?? '-'), 'creator rank': String(d.ranks?.creator ?? '-'),
    selection: String(d.selection), explain: String(m.explain[d.dealId] ?? ''),
  })));

  const loser = m.not_selected[0];
  if (!loser) { console.log('\nno not_selected deal to test fund on'); return; }
  const f = await api(`/deals/${loser}/fund`, undefined, 'POST');
  console.log(`\nfund not_selected ${short(loser)} -> ${f.status} ${JSON.stringify(f.json)}`);
  if (f.status !== 409) { console.error('expected 409'); process.exit(1); }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
