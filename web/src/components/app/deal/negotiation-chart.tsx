"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatOffer } from "@/lib/deals/use-deal";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";
import { describeDeliverables, fairFor } from "./deal-math";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";
const H = 200;
const PAD = { top: 16, right: 64, bottom: 28, left: 56 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(lo: number, hi: number, n = 4) {
  const raw = (hi - lo) / n || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; out.length < 2 || out[out.length - 1] < hi; v += step) out.push(v);
  return out;
}

const shortUsd = (n: number) => (n >= 10_000 ? `$${Math.round(n / 1000)}k` : fmtUsd(n));

/** Cash offers per round, brand vs creator, with the fair value of the deliverables as a reference. */
export function NegotiationChart({ offers, fairReel }: { offers: ChatOffer[]; fairReel: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const brand = offers.filter((o) => o.from === "brand");
  const creator = offers.filter((o) => o.from === "creator");
  const latest = offers[offers.length - 1];
  const fair = latest ? fairFor(latest.deliverables, fairReel) : fairReel;

  const rounds = Math.max(2, ...offers.map((o) => o.round));
  const values = [...offers.map((o) => o.amount), fair];
  const ticks = niceTicks(Math.min(...values) * 0.9, Math.max(...values) * 1.05);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const x = (r: number) => PAD.left + ((r - 1) / (rounds - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);
  const path = (pts: ChatOffer[]) => pts.map((o, i) => `${i ? "L" : "M"}${x(o.round).toFixed(1)},${y(o.amount).toFixed(1)}`).join(" ");

  const lastB = brand[brand.length - 1];
  const lastC = creator[creator.length - 1];
  const firstGap = brand[0] && creator[0] ? creator[0].amount - brand[0].amount : null;
  const gap = lastB && lastC ? lastC.amount - lastB.amount : null;
  const verdict =
    gap === null
      ? {
          text: "Waiting for both sides to put a number down",
          tone: "text-tertiary",
        }
      : gap <= 0 || latest?.final
        ? gap <= 0
          ? {
              text: `Met at ${fmtUsd(lastB.amount)}`,
              tone: "text-success-primary",
            }
          : { text: `Ended ${fmtUsd(gap)} apart`, tone: "text-warning-primary" }
        : firstGap !== null && gap < firstGap * 0.75
          ? {
              text: `Converging: gap down from ${fmtUsd(firstGap)} to ${fmtUsd(gap)}`,
              tone: "text-brand-secondary",
            }
          : {
              text: `Stuck: still ${fmtUsd(gap)} apart`,
              tone: "text-warning-primary",
            };

  // Keep end labels from colliding.
  let bLabelY = lastB ? y(lastB.amount) : 0;
  let cLabelY = lastC ? y(lastC.amount) : 0;
  if (lastB && lastC && Math.abs(bLabelY - cLabelY) < 14) {
    const mid = (bLabelY + cLabelY) / 2;
    cLabelY = mid - 7;
    bLabelY = mid + 7;
  }

  return (
    <div className={cx(card, "space-y-3 p-5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-md font-semibold text-primary">Cash offers by round</h2>
        <p className={cx("text-sm font-medium", verdict.tone)}>{verdict.text}</p>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tertiary">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-fg-secondary" />
          Brand offers
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-brand-solid" />
          Creator asks
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-fg-quaternary" />
          Fair for {describeDeliverables(latest?.deliverables ?? [])}
        </li>
      </ul>
      <div ref={ref} className="w-full">
        {offers.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center rounded-lg bg-secondary text-sm text-tertiary">The first offer will show up here</div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block overflow-visible" role="img" aria-label={`Cash offers by round. ${verdict.text}.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border-secondary" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-quaternary text-[11px] tabular-nums">
                  {shortUsd(t)}
                </text>
              </g>
            ))}
            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
              <text key={r} x={x(r)} y={H - 8} textAnchor="middle" className="fill-fg-quaternary text-[11px]">
                R{r}
              </text>
            ))}
            <line x1={PAD.left} x2={W - PAD.right} y1={y(fair)} y2={y(fair)} className="stroke-fg-quaternary" strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={PAD.left + 10} y={y(fair) - 6} className="fill-fg-tertiary text-[11px] tabular-nums">
              Fair {shortUsd(fair)}
            </text>

            {lastB && lastC && gap !== null && gap > 0 && (
              <line
                x1={x(Math.max(lastB.round, lastC.round))}
                x2={x(Math.max(lastB.round, lastC.round))}
                y1={y(lastC.amount)}
                y2={y(lastB.amount)}
                className="stroke-fg-warning-primary"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
            )}

            <path d={path(brand)} fill="none" className="stroke-fg-secondary transition-all duration-500" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path(creator)} fill="none" className="stroke-fg-brand-primary transition-all duration-500" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {offers.map((o, i) => (
              <g key={i}>
                <circle
                  cx={x(o.round)}
                  cy={y(o.amount)}
                  r={4.5}
                  strokeWidth={2}
                  className={cx("stroke-bg-primary", o.from === "brand" ? "fill-fg-secondary" : "fill-fg-brand-primary")}
                />
                <circle cx={x(o.round)} cy={y(o.amount)} r={12} fill="transparent">
                  <title>{`Round ${o.round}, ${o.from === "brand" ? "brand offer" : "creator ask"}: ${fmtUsd(o.amount)}`}</title>
                </circle>
              </g>
            ))}
            {lastB && (
              <text x={W - PAD.right + 6} y={bLabelY} dy="0.32em" className="fill-fg-secondary text-[11px] font-medium tabular-nums">
                {shortUsd(lastB.amount)}
              </text>
            )}
            {lastC && (
              <text x={W - PAD.right + 6} y={cLabelY} dy="0.32em" className="fill-fg-brand-primary text-[11px] font-medium tabular-nums">
                {shortUsd(lastC.amount)}
              </text>
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
