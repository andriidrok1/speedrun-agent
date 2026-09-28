// CampaignDO: one per campaign. Holds the brand budget and a ledger of what each deal holds.
// budgetLeft = budgetTotal - sum(reserved + committed). Released rows return money to the pool.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import type { BrandProfile, DealStatus } from './types';

export type LedgerState = 'reserved' | 'committed' | 'released';
export type DealSummary = { dealId: string; creatorSlug: string; status: DealStatus; price: number };
export type CampaignView = {
  campaignId: string;
  brandSlug: string;
  budgetTotal: number;
  budgetLeft: number;
  /** Max creators the brand wants to pay for; the market match selects at most this many. */
  headcount: number;
  deals: DealSummary[];
};

// Errors cross the DO RPC boundary as plain Error(message). The HTTP status rides in the message
// as a "[nnn] " prefix; the Worker strips it with errStatus/errMessage.
export function fail(status: number, message: string): never {
  throw new Error(`[${status}] ${message}`);
}
export function errStatus(e: unknown): number {
  const m = /^\[(\d{3})\] /.exec(e instanceof Error ? e.message : String(e));
  return m ? Number(m[1]) : 500;
}
export function errMessage(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).replace(/^\[\d{3}\] /, '');
}

export type FinalizePick = { dealId: string; creatorSlug: string; price: number; reason: string };
export type FinalizeRecord = { headcount: number; winners: FinalizePick[]; others: FinalizePick[] };

type MetaRow = { campaignId: string; brandSlug: string; budgetTotal: number; headcount?: number | null };
type LedgerRow = { dealId: string; creatorSlug: string; amount: number; state: LedgerState; status: DealStatus };

export class CampaignDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      campaignId TEXT NOT NULL,
      brandSlug TEXT NOT NULL,
      budgetTotal REAL NOT NULL,
      headcount INTEGER
    )`);
    try { this.sql.exec('ALTER TABLE meta ADD COLUMN headcount INTEGER'); } catch { /* column exists */ }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ledger (
      dealId TEXT PRIMARY KEY,
      creatorSlug TEXT NOT NULL,
      amount REAL NOT NULL,
      state TEXT NOT NULL,
      status TEXT NOT NULL
    )`);
  }

  init(args: { campaignId: string; brandSlug: string; budgetTotal: number; headcount?: number; brand?: BrandProfile }): CampaignView {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS brand (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
    if (args.brand) {
      this.sql.exec(
        `INSERT INTO brand (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
        JSON.stringify(args.brand),
      );
    }
    this.sql.exec(
      `INSERT INTO meta (id, campaignId, brandSlug, budgetTotal, headcount) VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET campaignId = excluded.campaignId, brandSlug = excluded.brandSlug, budgetTotal = excluded.budgetTotal, headcount = excluded.headcount`,
      args.campaignId, args.brandSlug, args.budgetTotal, args.headcount ?? 3,
    );
    return this.get();
  }

  get(): CampaignView {
    const meta = this.meta();
    const deals = this.sql.exec<LedgerRow>('SELECT dealId, creatorSlug, amount, state, status FROM ledger ORDER BY rowid').toArray();
    return {
      campaignId: meta.campaignId,
      brandSlug: meta.brandSlug,
      budgetTotal: meta.budgetTotal,
      budgetLeft: this.budgetLeft(meta.budgetTotal),
      headcount: meta.headcount ?? 3,
      deals: deals.map((d) => ({ dealId: d.dealId, creatorSlug: d.creatorSlug, status: d.status, price: d.amount })),
    };
  }

  /** The brand profile from onboarding, or null when the campaign uses a bundled brand. */
  brandProfile(): BrandProfile | null {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS brand (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
    const row = this.sql.exec<{ json: string }>('SELECT json FROM brand WHERE id = 1').toArray()[0];
    return row ? (JSON.parse(row.json) as BrandProfile) : null;
  }

  /** Hold `amount` for a deal. Returns ok=false (no throw) when the budget cannot cover it. */
  reserve(dealId: string, creatorSlug: string, amount: number): { ok: boolean; budgetLeft: number } {
    const meta = this.meta();
    const left = this.budgetLeft(meta.budgetTotal);
    if (amount > left) return { ok: false, budgetLeft: left };
    this.sql.exec(
      `INSERT INTO ledger (dealId, creatorSlug, amount, state, status) VALUES (?, ?, ?, 'reserved', 'agreed')
       ON CONFLICT(dealId) DO UPDATE SET amount = excluded.amount, state = 'reserved', status = 'agreed'`,
      dealId, creatorSlug, amount,
    );
    return { ok: true, budgetLeft: this.budgetLeft(meta.budgetTotal) };
  }

  /** Money went out to the creator. Stays counted against the budget. */
  commit(dealId: string): { budgetLeft: number } {
    return this.transition(dealId, 'reserved', 'committed', 'paid_out');
  }

  /** Brand was refunded. Money returns to the pool. */
  release(dealId: string): { budgetLeft: number } {
    return this.transition(dealId, 'reserved', 'released', 'refunded');
  }

  /** Agreed deal the brand's agent passed on at finalize: its reservation returns to the pool.
   *  Idempotent: a row that is no longer reserved only gets its status updated. */
  releaseUnselected(dealId: string): { budgetLeft: number } {
    const meta = this.meta();
    this.sql.exec(
      `UPDATE ledger SET state = CASE WHEN state = 'reserved' THEN 'released' ELSE state END, status = 'walked_away' WHERE dealId = ?`,
      dealId,
    );
    return { budgetLeft: this.budgetLeft(meta.budgetTotal) };
  }

  /** Winners/others picked by POST /campaigns/:id/finalize, kept so a second call returns the same pick. */
  finalized(): FinalizeRecord | null {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS finalize (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
    const row = this.sql.exec<{ json: string }>('SELECT json FROM finalize WHERE id = 1').toArray()[0];
    return row ? (JSON.parse(row.json) as FinalizeRecord) : null;
  }

  setFinalized(record: FinalizeRecord): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS finalize (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)`);
    this.sql.exec(
      `INSERT INTO finalize (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
      JSON.stringify(record),
    );
  }

  /** Record a status for the campaign summary without touching money (walked_away, held). */
  note(dealId: string, creatorSlug: string, status: DealStatus): { budgetLeft: number } {
    const meta = this.meta();
    this.sql.exec(
      `INSERT INTO ledger (dealId, creatorSlug, amount, state, status) VALUES (?, ?, 0, 'released', ?)
       ON CONFLICT(dealId) DO UPDATE SET status = excluded.status`,
      dealId, creatorSlug, status,
    );
    return { budgetLeft: this.budgetLeft(meta.budgetTotal) };
  }

  reset(): { ok: true } {
    // Demo helper. Rows for held/paid deals are kept so verify/expire can still commit/release.
    this.sql.exec("DELETE FROM ledger WHERE state = 'released' OR status IN ('agreed','walked_away','negotiating')");
    this.sql.exec('DROP TABLE IF EXISTS finalize');
    return { ok: true };
  }

  private transition(dealId: string, from: LedgerState, to: LedgerState, status: DealStatus): { budgetLeft: number } {
    const meta = this.meta();
    const row = this.sql.exec<LedgerRow>('SELECT dealId, creatorSlug, amount, state, status FROM ledger WHERE dealId = ?', dealId).toArray()[0];
    if (!row) fail(404, `campaign ${meta.campaignId}: no ledger row for deal ${dealId}`);
    if (row.state !== from) fail(409, `campaign ${meta.campaignId}: deal ${dealId} is ${row.state}, expected ${from}`);
    this.sql.exec('UPDATE ledger SET state = ?, status = ? WHERE dealId = ?', to, status, dealId);
    return { budgetLeft: this.budgetLeft(meta.budgetTotal) };
  }

  private meta(): MetaRow {
    const row = this.sql.exec<MetaRow>('SELECT campaignId, brandSlug, budgetTotal, headcount FROM meta WHERE id = 1').toArray()[0];
    if (!row) fail(404, 'campaign not found');
    return row;
  }

  private budgetLeft(total: number): number {
    const row = this.sql
      .exec<{ used: number | null }>(`SELECT SUM(amount) AS used FROM ledger WHERE state IN ('reserved', 'committed')`)
      .one();
    return total - (row.used ?? 0);
  }
}
