"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Creator, Deal, DealStatus, Offer } from "@shared/contract";
import { fmtUsd } from "@/lib/format";
import { negotiate, rulesFor } from "./negotiate";

// Fake deal engine. Later this hook talks to Andrii's server through
// useAgent({ agent: "Negotiation", name: dealId }) and the page stays the same.

export const BUDGET = 20_000;
export const PLATFORM_FEE = 0.1;
const MESSAGE_DELAY_MS = 1600;

export type FeedItem =
  | { kind: "offer"; offer: Offer; round: number }
  | { kind: "event"; status: DealStatus; text: string };

export function useDeal(creator: Creator, dealId: string) {
  const rules = useMemo(() => rulesFor(creator), [creator]);
  const script = useMemo(() => negotiate(creator, dealId), [creator, dealId]);
  const agreedPrice = script[script.length - 1].amount;

  const [run, setRun] = useState(0); // bump to replay
  const [shown, setShown] = useState(0);
  const [status, setStatus] = useState<DealStatus>("negotiating");
  const [events, setEvents] = useState<FeedItem[]>([]);

  const addEvent = useCallback((s: DealStatus, text: string) => {
    setStatus(s);
    setEvents((e) => [...e, { kind: "event", status: s, text }]);
  }, []);

  // Play the negotiation one message at a time
  useEffect(() => {
    if (status !== "negotiating") return;
    if (shown < script.length) {
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : MESSAGE_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => addEvent("agreed", `Deal agreed at ${fmtUsd(agreedPrice)}`), 500);
    return () => clearTimeout(t);
  }, [shown, status, script.length, agreedPrice, addEvent, run]);

  const pay = useCallback(() => {
    addEvent("paid", `Brand paid ${fmtUsd(agreedPrice)} with Stripe (test mode)`);
    setTimeout(() => addEvent("held", `Stripe is holding ${fmtUsd(agreedPrice)} until the post is live`), 1200);
  }, [addEvent, agreedPrice]);

  const markLive = useCallback(() => {
    addEvent("live", `Post verified live on ${creator.platform === "tiktok" ? "TikTok" : "Instagram"}`);
  }, [addEvent, creator.platform]);

  const releasePayout = useCallback(() => {
    const payout = Math.round(agreedPrice * (1 - PLATFORM_FEE));
    addEvent("paid_out", `Paid out ${fmtUsd(payout)} to ${creator.handle}, platform kept ${fmtUsd(agreedPrice - payout)}`);
  }, [addEvent, agreedPrice, creator.handle]);

  const replay = useCallback(() => {
    setShown(0);
    setEvents([]);
    setStatus("negotiating");
    setRun((r) => r + 1);
  }, []);

  const offers = script.slice(0, shown);
  const latest = offers[offers.length - 1];
  const feed: FeedItem[] = [...offers.map((offer, i) => ({ kind: "offer" as const, offer, round: Math.floor(i / 2) + 1 })), ...events];
  const price = status === "negotiating" ? (latest?.amount ?? 0) : agreedPrice;

  const deal: Deal = {
    dealId,
    status,
    price,
    budgetLeft: status === "negotiating" ? BUDGET : BUDGET - agreedPrice,
  };

  const typing = status === "negotiating" && shown < script.length ? script[shown].from : null;

  return { deal, rules, feed, latest, typing, pay, markLive, releasePayout, replay };
}
