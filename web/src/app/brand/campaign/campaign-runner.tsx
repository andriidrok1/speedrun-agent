"use client";

import { useEffect, useMemo, useState } from "react";
import { PlayCircle } from "@untitledui/icons";
import type { Creator } from "@shared/contract";
import { Button } from "@/components/base/buttons/button";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { useSavedBrand } from "@/lib/onboarding/store";
import { buildBrandProfile } from "@/lib/onboarding/profiles";
import { brainbase, type BrainbaseTask } from "@/lib/brainbase";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";
import { ActivityFeed } from "./activity-feed";
import { Report } from "./report";

type Mode = "yours" | "demo";

const DEMO_CREATOR = "maya-wears";

export function CampaignRunner({ creators, source, initialTaskId }: { creators: Creator[]; source: "apify" | "fake"; initialTaskId: string | null }) {
  const saved = useSavedBrand();
  const brand = saved ?? null;
  const brandName = brand ? brand.name : "Marine Layer";
  const campaignName = brand ? brand.campaignName : "Demo campaign";
  const budget = brand?.totalBudget ?? 20_000;
  const headcount = Math.max(1, brand?.creators ?? 5);
  const perCreator = budget / headcount;

  // Top N by fair price fit: closest to budget per creator, plus two backups.
  const shortlist = useMemo(
    () => [...creators].sort((a, b) => Math.abs(a.fairPrice - perCreator) - Math.abs(b.fairPrice - perCreator)).slice(0, headcount + 2),
    [creators, perCreator, headcount],
  );

  const [mode, setMode] = useState<Mode>("yours");
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [task, setTask] = useState<BrainbaseTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Poll the task every 3 s until it is done.
  useEffect(() => {
    if (!taskId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const t = await brainbase.getTask(taskId);
        if (stop) return;
        setTask(t);
        setError(null);
        if (t.done) return;
      } catch (e) {
        if (stop) return;
        setError(e instanceof Error ? e.message : String(e));
      }
      timer = setTimeout(tick, 3000);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [taskId]);

  // Clock for the elapsed time while the task runs.
  const running = !!taskId && !task?.done;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setTask(null);
    try {
      const body =
        mode === "demo"
          ? { brandSlug: "marine-layer", budgetUsd: 20_000, headcount: 1, creators: [DEMO_CREATOR] }
          : {
              ...(brand ? { brand: buildBrandProfile(brand) } : { brandSlug: "marine-layer" }),
              budgetUsd: budget,
              headcount,
              creators: shortlist,
            };
      const { taskId: id } = await brainbase.startCampaign(body);
      setStartedAt(Date.now());
      setNow(Date.now());
      setTaskId(id);
      window.history.replaceState(null, "", `/brand/campaign?task=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const createdMs = task?.createdAt ? Date.parse(task.createdAt.endsWith("Z") ? task.createdAt : `${task.createdAt}Z`) : startedAt;
  const endMs = task?.done && task.terminalAt ? Date.parse(task.terminalAt) : now;
  const elapsed = createdMs ? Math.max(0, Math.round((endMs - createdMs) / 1000)) : 0;

  return (
    <div className="space-y-6">
      <section className="space-y-5 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-md font-semibold text-primary">
              {brandName}: {campaignName}
            </h2>
            <p className="text-sm text-tertiary">
              {fmtUsd(budget)} for up to {headcount} creators, about {fmtUsd(perCreator)} each.
              {brand ? "" : " Demo brand: set up your own in brand onboarding."}
            </p>
          </div>
          <Button size="md" color="primary" iconLeading={PlayCircle} isLoading={starting} isDisabled={starting || running} onClick={start}>
            {running ? "Running" : "Run with Brainbase"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Creators to send">
          <ModeButton active={mode === "yours"} onClick={() => setMode("yours")}>
            Your creators ({shortlist.length})
          </ModeButton>
          <ModeButton active={mode === "demo"} onClick={() => setMode("demo")}>
            Bundled demo: Marine Layer + maya-wears
          </ModeButton>
        </div>

        {mode === "yours" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-tertiary">
                <tr className="border-b border-secondary">
                  <th className="py-2 pr-4 font-medium">Creator</th>
                  <th className="py-2 pr-4 font-medium">Followers</th>
                  <th className="py-2 pr-4 font-medium">Avg views (30d)</th>
                  <th className="py-2 pr-4 font-medium">Engagement</th>
                  <th className="py-2 font-medium">Fair price</th>
                </tr>
              </thead>
              <tbody>
                {shortlist.map((c) => (
                  <tr key={c.handle} className="border-b border-secondary last:border-0">
                    <td className="py-2 pr-4 font-medium text-primary">{c.handle}</td>
                    <td className="py-2 pr-4 text-secondary">{fmtCompact(c.followers)}</td>
                    <td className="py-2 pr-4 text-secondary">{fmtCompact(c.avgViews30d)}</td>
                    <td className="py-2 pr-4 text-secondary">{fmtPct(c.engagement)}</td>
                    <td className="py-2 text-secondary">{fmtUsd(c.fairPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-tertiary">
              Closest fair price to the per-creator budget, {headcount} plus 2 backups. {source === "apify" ? "Live data from Apify." : "Fake data."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-tertiary">
            The bundled Marine Layer brand with the bundled creator maya-wears, budget {fmtUsd(20_000)}, headcount 1. Works with the deployed MCP as is.
          </p>
        )}
      </section>

      {error && <p className="rounded-lg bg-error-primary px-4 py-3 text-sm text-error-primary ring-1 ring-error_subtle ring-inset">{error}</p>}

      {taskId && (
        <section className="space-y-4 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-md font-semibold text-primary">Agent activity</h2>
              <p className="text-xs text-tertiary">
                {task?.title ? `${task.title} · ` : ""}Task {taskId.slice(0, 8)} · updates every 3 s
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-tertiary tabular-nums">{fmtElapsed(elapsed)}</span>
              <StatusBadge status={task?.status ?? "starting"} />
            </div>
          </div>
          <ActivityFeed events={task?.events ?? []} running={running} />
        </section>
      )}

      {task?.report && (
        <section className="space-y-4 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
          <h2 className="text-md font-semibold text-primary">Campaign report</h2>
          <Report markdown={task.report} />
        </section>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors ${
        active ? "bg-secondary text-primary ring-primary" : "bg-primary text-tertiary ring-secondary hover:text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "success" ? "success" : status === "fail" || status === "failed" || status === "error" ? "error" : status === "need_more_info" ? "warning" : "brand";
  return (
    <BadgeWithDot color={color} size="md">
      {status.replace(/_/g, " ")}
    </BadgeWithDot>
  );
}

function fmtElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
