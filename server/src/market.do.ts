// MarketDO: one singleton ("market") that indexes every deal by campaign and creator, so the market
// layer (evaluation + match) can find deals across campaigns without scanning DealDO ids.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

export type MarketDealRow = { dealId: string; campaignId: string; brandSlug: string; creatorSlug: string; createdAt: string };

export class MarketDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS deals (
      dealId TEXT PRIMARY KEY,
      campaignId TEXT NOT NULL,
      brandSlug TEXT NOT NULL,
      creatorSlug TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS deals_campaign ON deals (campaignId)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS deals_creator ON deals (creatorSlug)`);
  }

  /** Upsert. Called from DealDO.create right after the deal row is saved. */
  register(deal: MarketDealRow): { ok: true } {
    this.sql.exec(
      `INSERT INTO deals (dealId, campaignId, brandSlug, creatorSlug, createdAt) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(dealId) DO UPDATE SET campaignId = excluded.campaignId, brandSlug = excluded.brandSlug,
         creatorSlug = excluded.creatorSlug, createdAt = excluded.createdAt`,
      deal.dealId, deal.campaignId, deal.brandSlug, deal.creatorSlug, deal.createdAt,
    );
    return { ok: true };
  }

  dealsForCreator(creatorSlug: string): MarketDealRow[] {
    return this.sql.exec<MarketDealRow>('SELECT * FROM deals WHERE creatorSlug = ? ORDER BY createdAt', creatorSlug).toArray();
  }

  dealsForCampaigns(campaignIds: string[]): MarketDealRow[] {
    if (campaignIds.length === 0) return [];
    const marks = campaignIds.map(() => '?').join(',');
    return this.sql.exec<MarketDealRow>(`SELECT * FROM deals WHERE campaignId IN (${marks}) ORDER BY createdAt`, ...campaignIds).toArray();
  }

  all(): MarketDealRow[] {
    return this.sql.exec<MarketDealRow>('SELECT * FROM deals ORDER BY createdAt').toArray();
  }

  reset(): { ok: true } {
    this.sql.exec('DELETE FROM deals');
    return { ok: true };
  }
}
