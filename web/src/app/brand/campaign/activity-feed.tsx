"use client";

import type { FC } from "react";
import {
  BarChart01,
  Building02,
  CheckCircle,
  Clock,
  CurrencyDollar,
  File06,
  MessageChatCircle,
  SearchLg,
  ShieldTick,
  Target04,
  Tool01,
  Trophy01,
  Users01,
  XCircle,
} from "@untitledui/icons";
import { argsSummary, resultStatus, toolLabel, type BrainbaseEvent } from "@/lib/brainbase";

const ICONS: Record<string, FC<{ className?: string }>> = {
  list_brands: Building02,
  list_creators: Users01,
  create_campaign: Target04,
  campaign_status: BarChart01,
  start_deal: MessageChatCircle,
  get_deal: File06,
  wait_for_deal: Clock,
  fund_deal: CurrencyDollar,
  verify_post: ShieldTick,
  expire_deal: XCircle,
  evaluate_campaign: BarChart01,
  evaluate_creator: SearchLg,
  match_market: Trophy01,
};

export function ActivityFeed({ events, running }: { events: BrainbaseEvent[]; running: boolean }) {
  // The last assistant message is shown as the report below; keep the feed to the play-by-play.
  const shown = events.filter((e) => e.type !== "user");
  if (shown.length === 0) {
    return <p className="text-sm text-tertiary">{running ? "The agent is starting up. First tool calls usually appear within 30 seconds." : "No activity."}</p>;
  }
  return (
    <ol className="space-y-1">
      {shown.map((e, i) => (e.type === "tool" ? <ToolRow key={i} e={e} /> : <MessageRow key={i} e={e} />))}
      {running && (
        <li className="flex items-center gap-3 px-3 py-2 text-sm text-tertiary">
          <span className="size-2 animate-pulse rounded-full bg-brand-solid" aria-hidden />
          Working
        </li>
      )}
    </ol>
  );
}

function ToolRow({ e }: { e: BrainbaseEvent }) {
  const Icon = ICONS[e.name ?? ""] ?? Tool01;
  const args = argsSummary(e);
  const status = resultStatus(e);
  return (
    <li className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-primary_hover">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary ring-1 ring-secondary ring-inset">
        <Icon className="size-4 text-fg-tertiary" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="text-sm font-medium text-primary">{toolLabel(e)}</span>
          <span className="text-xs text-quaternary">{e.name}</span>
        </div>
        {args && <p className="truncate text-xs text-tertiary">{args}</p>}
      </div>
      <span className="mt-1 flex shrink-0 items-center gap-1 text-xs">
        {e.status === "running" && <span className="text-tertiary">running</span>}
        {e.status === "success" && (
          <>
            <CheckCircle className="size-4 text-fg-success-primary" />
            {status && <span className="text-success-primary">{status}</span>}
          </>
        )}
        {e.status === "error" && (
          <>
            <XCircle className="size-4 text-fg-error-primary" />
            <span className="max-w-60 truncate text-error-primary" title={status ?? undefined}>
              {status}
            </span>
          </>
        )}
      </span>
    </li>
  );
}

function MessageRow({ e }: { e: BrainbaseEvent }) {
  const text = (e.text ?? "").replace(/\*\*|`/g, "");
  // Long messages (the final report) are rendered in full in the report card.
  const preview = text.length > 280 ? `${text.slice(0, 280).trimEnd()}...` : text;
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-primary">
        <MessageChatCircle className="size-4 text-fg-brand-primary" />
      </span>
      <p className="min-w-0 flex-1 text-sm whitespace-pre-line text-secondary">{preview}</p>
    </li>
  );
}
