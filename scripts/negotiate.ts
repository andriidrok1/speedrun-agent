// Run one negotiation and write a transcript. --llm off = deterministic engine, --llm on = OpenAI agents refereed by the engine.
// Usage (from server/): npx tsx ../scripts/negotiate.ts --brand marine-layer --creator maya-wears --llm off
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBrand, loadBrandNarrative, loadCreator, loadCreatorNarrative } from '../server/src/profiles';
import { runNegotiation, type NegotiationResult } from '../server/src/engine/index';
import { createClient, ModelNotFoundError } from '../server/src/agents/llm';
import { runNegotiationLLM, type NegotiationResultLLM } from '../server/src/agents/negotiate';
import type { Turn } from '../server/src/types';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined || v.startsWith('--')) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}

const brandSlug = arg('brand', 'marine-layer');
const creatorSlug = arg('creator', 'maya-wears');
const llm = arg('llm', 'off');
const now = new Date(arg('now', new Date().toISOString()));
if (Number.isNaN(now.getTime())) throw new Error('--now must be an ISO date');
if (llm !== 'off' && llm !== 'on') throw new Error(`--llm must be on or off, got "${llm}"`);

/** KEY=VALUE lines from server/.dev.vars (no quotes handling beyond trimming), env wins. */
function readDevVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const file = join(import.meta.dirname, '..', 'server', '.dev.vars');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const brand = loadBrand(brandSlug);
const creator = loadCreator(creatorSlug);

async function runLLM(): Promise<NegotiationResultLLM & { wall_ms: number }> {
  const apiKey = readDevVar('OPENAI_API_KEY');
  if (!apiKey) {
    console.error('OPENAI_API_KEY not found: set it in server/.dev.vars (OPENAI_API_KEY=...) or the environment.');
    process.exit(2);
  }
  const client = createClient(apiKey, readDevVar('OPENAI_MODEL') || undefined);
  console.error(`[llm] model ${client.model}`);
  const t0 = Date.now();
  try {
    const r = await runNegotiationLLM({
      brand, creator, now, client,
      brandNarrative: loadBrandNarrative(brandSlug),
      creatorNarrative: loadCreatorNarrative(creatorSlug),
    });
    return { ...r, wall_ms: Date.now() - t0 };
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      console.error(err.message);
      process.exit(2);
    }
    throw err;
  }
}

// scripts/ has no package.json, so tsx compiles this as CJS: no top-level await, hence main().
async function main(): Promise<void> {
  const result: NegotiationResult | (NegotiationResultLLM & { wall_ms: number }) =
    llm === 'on' ? await runLLM() : runNegotiation({ brand, creator, now });

  const money = (n: number) => n.toFixed(2);
  const retail = (t: Turn) => t.package.product.reduce((s, p) => s + p.retail_value_usd * p.qty, 0);
  const header = ['round', 'from', 'cash', 'product retail', 'affiliate', 'credit', 'custom', 'value_brand', 'value_creator', 'status'];
  const rows = result.turns.map((t) => [
    String(t.round), t.from, money(t.package.cash_usd), money(retail(t)), `${t.package.affiliate_pct}%`,
    money(t.package.store_credit_usd), String(t.package.custom.length), money(t.value_for_brand_usd), money(t.value_for_creator_usd), t.status,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  const table = [line(header), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...rows.map(line)].join('\n');

  console.log(`${brand.public.name} x ${creator.public.name} (${creator.public.handle}), now=${now.toISOString()}`);
  console.log(table);
  console.log(`\noutcome: ${result.outcome} after ${result.rounds} round(s)`);
  if (result.acceptedOffer) {
    const a = result.acceptedOffer;
    console.log(`accepted: ${JSON.stringify(a.package)}`);
    console.log(`terms: ${a.deliverables.map((d) => `${d.qty} ${d.type}`).join(' + ')}, ${a.usage_rights}, ${a.exclusivity.days}d ${a.exclusivity.category} exclusivity, due ${a.deadline}`);
  }

  const outDir = join(import.meta.dirname, '..', 'transcripts');
  mkdirSync(outDir, { recursive: true });
  const stamp = now.toISOString().replace(/:/g, '-');
  const base = join(outDir, `${brandSlug}__${creatorSlug}__${stamp}${llm === 'on' ? '__llm' : ''}`);
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ brand: brandSlug, creator: creatorSlug, now: now.toISOString(), outcome: result.outcome, rounds: result.rounds, acceptedOffer: result.acceptedOffer ?? null, turns: result.turns }, null, 2),
  );
  const chat = result.turns.map((t) => `**${t.from}** (round ${t.round}, ${t.status}): ${t.message}`).join('\n\n');
  writeFileSync(
    `${base}.md`,
    `# ${brand.public.name} x ${creator.public.name}\n\nnow: ${now.toISOString()}  \noutcome: **${result.outcome}** after ${result.rounds} round(s)\n\n${table}\n\n## Chat\n\n${chat}\n`,
  );
  console.log(`\nwrote ${base}.json\nwrote ${base}.md`);
  if ('wall_ms' in result && 'substitutions' in result && 'rule_violations' in result) {
    console.log(`rule_violations: ${result.rule_violations}, substitutions: ${result.substitutions}, wall_ms: ${result.wall_ms}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
