// Client for the Brainbase proxy on the deals server (server/src/brainbase.ts).
// The Brainbase token never reaches the browser: the server starts the task and relays its events.
import type { Creator } from "@shared/contract";
import { API } from "@/lib/deals/api";
import { fmtUsd } from "@/lib/format";

export type BrainbaseEvent = {
  type: "tool" | "assistant" | "user";
  name?: string;
  args?: Record<string, unknown>;
  text?: string;
  result?: unknown;
  status?: "running" | "success" | "error";
  ts: string;
};

export type BrainbaseTask = {
  taskId: string;
  title: string | null;
  status: string;
  done: boolean;
  createdAt: string | null;
  terminalAt: string | null;
  events: BrainbaseEvent[];
  report?: string;
};

export type CampaignRequest = {
  brandSlug?: string;
  brand?: unknown;
  budgetUsd?: number;
  headcount?: number;
  creators?: (Creator | string)[];
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json" } });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const brainbase = {
  startCampaign: (body: CampaignRequest) => req<{ taskId: string; status: string }>("/brainbase/campaign", { method: "POST", body: JSON.stringify(body) }),
  getTask: (id: string) => req<BrainbaseTask>(`/brainbase/tasks/${encodeURIComponent(id)}`),
};

// ---- human labels for the activity feed ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const s = (v: unknown) => (typeof v === "string" ? v : "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const short = (id: unknown) => (typeof id === "string" ? id.slice(0, 8) : "");
const who = (a: Obj, r: Obj) => {
  const creator = isObj(a.creator) ? s(a.creator.handle) : "";
  const slug = s(a.creatorSlug) || s(r.creatorSlug);
  return creator || (slug ? `@${slug}` : "a creator");
};

/** One-line human label for a tool call, using its args and (when finished) its result. */
export function toolLabel(e: BrainbaseEvent): string {
  const a = e.args ?? {};
  const r = isObj(e.result) ? e.result : {};
  const list = Array.isArray(e.result) ? e.result : [];
  switch (e.name) {
    case "list_brands":
      return list.length ? `Looked up ${plural(list.length, "brand")}` : "Looking up brands";
    case "list_creators":
      return list.length ? `Looked up ${plural(list.length, "creator")}` : "Looking up creators";
    case "create_campaign": {
      const budget = typeof r.budgetTotal === "number" ? r.budgetTotal : typeof a.budgetUsd === "number" ? a.budgetUsd : null;
      const brand = s(r.brandSlug) || s(a.brandSlug) || "the brand";
      return `Created campaign for ${brand}${budget !== null ? ` with ${fmtUsd(budget)}` : ""}`;
    }
    case "campaign_status":
      return typeof r.budgetLeft === "number" && typeof r.budgetTotal === "number"
        ? `Budget check: ${fmtUsd(r.budgetLeft)} of ${fmtUsd(r.budgetTotal)} left`
        : "Checked campaign budget";
    case "start_deal":
      return `Started negotiation with ${who(a, r)}`;
    case "get_deal":
      return `Read deal ${short(a.dealId)}`;
    case "wait_for_deal": {
      const status = s(r.status);
      if (!status) return `Waiting on negotiation ${short(a.dealId)}`;
      if (status === "negotiating") return `Still negotiating with ${who(a, r)}`;
      if (status === "agreed") return `Agreed with ${who(a, r)}${typeof r.price === "number" ? ` at ${fmtUsd(r.price)}` : ""}`;
      return `Negotiation with ${who(a, r)} ended: ${status.replace(/_/g, " ")}`;
    }
    case "fund_deal":
      return typeof r.price === "number" ? `Funded deal ${fmtUsd(r.price)}` : `Funding deal ${short(a.dealId)}`;
    case "verify_post":
      if (r.verified === true) return "Post verified, payout sent";
      if (r.verified === false) return "Post check failed, deal stays held";
      return "Verifying post";
    case "expire_deal":
      return "Refunded deal";
    case "evaluate_campaign": {
      const ranked = Array.isArray(r.ranked) ? r.ranked.length : null;
      return ranked !== null ? `Ranked ${plural(ranked, "agreed deal")} for the brand` : "Ranking agreed deals";
    }
    case "evaluate_creator":
      return `Ranked offers for ${who(a, r)}`;
    case "match_market": {
      const sel = Array.isArray(r.selected) ? r.selected.length : null;
      const not = Array.isArray(r.not_selected) ? r.not_selected.length : 0;
      return sel !== null ? `Matched ${sel} creator${sel === 1 ? "" : "s"}${not ? `, ${not} not selected` : ""}` : "Matching the market";
    }
    default:
      return e.name ?? "Tool call";
  }
}

/** Short args summary, skipping bulky objects. */
export function argsSummary(e: BrainbaseEvent): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.args ?? {})) {
    if (typeof v === "string") parts.push(`${k}: ${k.toLowerCase().endsWith("id") ? v.slice(0, 8) : v}`);
    else if (typeof v === "number" || typeof v === "boolean") parts.push(`${k}: ${v}`);
    else if (Array.isArray(v)) parts.push(`${k}: ${v.length} item${v.length === 1 ? "" : "s"}`);
    else if (isObj(v)) parts.push(`${k}: ${s(v.handle) || (isObj(v.public) ? s(v.public.name) : "") || "object"}`);
  }
  return parts.join(" · ");
}

/** Status word from a tool result (deal status, verify outcome) or the error text. */
export function resultStatus(e: BrainbaseEvent): string | null {
  if (e.status === "running") return null;
  if (e.status === "error") return typeof e.result === "string" ? e.result.slice(0, 120) : "error";
  const r = isObj(e.result) ? e.result : null;
  if (r && typeof r.status === "string") return r.status.replace(/_/g, " ");
  return null;
}
