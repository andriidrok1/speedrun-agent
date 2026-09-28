"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageChatCircle, Settings01, Stars01 } from "@untitledui/icons";
import type { Creator, DealStatus } from "@shared/contract";
import { DealView } from "@/app/deals/[id]/deal-view";
import { PageHeader } from "@/components/app/page-header";
import { Avatar } from "@/components/base/avatar/avatar";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { api, creatorDeals, type InboxItem } from "@/lib/deals/api";
import { buildBrandProfile, buildCreatorProfile, brandFormDefaults, type CreatorForm } from "@/lib/onboarding/profiles";
import { useSavedCreator } from "@/lib/onboarding/store";
import { fmtUsd } from "@/lib/format";
import { cx } from "@/utils/cx";

const POLL_MS = 4000;
const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

const STATUS: Record<DealStatus, { label: string; color: "brand" | "gray" | "success" | "warning" | "error" }> = {
  negotiating: { label: "Negotiating", color: "brand" },
  agreed: { label: "Agreed", color: "warning" },
  held: { label: "Paid, held", color: "brand" },
  paid_out: { label: "Paid out", color: "success" },
  refunded: { label: "Refunded", color: "gray" },
  walked_away: { label: "No deal", color: "gray" },
};

/** Scraped stats when we have them, otherwise a minimal Creator from the saved rules. */
function creatorFor(form: CreatorForm, creators: Creator[]): Creator {
  const match = creators.find((c) => c.handle.replace("@", "").toLowerCase() === form.handle.toLowerCase());
  return match ?? { handle: `@${form.handle}`, platform: "instagram", followers: 0, avgViews30d: 0, engagement: 0, fairPrice: form.idealReel, name: form.name || form.handle };
}

// Brands that "reach out" in the demo. Anthropic is there to show favorite-brand pricing.
const SAMPLE_BRANDS = [
  { brandSlug: "marine-layer" },
  { brandSlug: "temescal-hair" },
  {
    brand: buildBrandProfile({
      ...brandFormDefaults,
      name: "Anthropic",
      site: "https://www.anthropic.com",
      category: "AI software",
      campaignName: "Claude for creators",
      goal: "Show how creators use Claude in their workflow",
      voice: "Thoughtful, plain spoken, a little nerdy.",
      totalBudget: 20_000,
      maxPerCreator: 1_400,
      startingOffer: 500,
      products: "Claude Max for a year, 2400, 0",
      perks: "Visit to the SF office",
    }),
  },
];

export function Inbox({ creators }: { creators: Creator[] }) {
  const saved = useSavedCreator();
  if (saved === undefined) return null;
  if (!saved) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-16 text-center sm:px-6">
        <h1 className="text-display-xs font-semibold text-primary">Set your rules first</h1>
        <p className="text-md text-tertiary">Your agent needs your prices and limits before it can talk to brands.</p>
        <Button href="/creator" size="lg">Set my deal rules</Button>
      </main>
    );
  }
  return <InboxView form={saved} creator={creatorFor(saved, creators)} />;
}

function InboxView({ form, creator }: { form: CreatorForm; creator: Creator }) {
  const slug = form.handle.toLowerCase();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { deals } = await creatorDeals(slug);
      setItems(deals);
      setSelected((s) => s ?? deals[0]?.dealId ?? null);
    } catch {
      setItems((prev) => prev ?? []);
      setError("The deals server is not reachable.");
    }
  }, [slug]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  async function getSampleOffers() {
    setInviting(true);
    setError(null);
    try {
      const creatorProfile = buildCreatorProfile(form, creator);
      await Promise.all(
        SAMPLE_BRANDS.map(async (b) => {
          const camp = await api.createCampaign(b);
          return api.startDeal({ campaignId: camp.campaignId, creatorSlug: slug, creator, creatorProfile });
        }),
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviting(false);
    }
  }

  const active = useMemo(() => items?.find((i) => i.dealId === selected), [items, selected]);
  const needsYou = (i: InboxItem) => i.status === "agreed" && !!i.approvals && !i.approvals.creator;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="Your deals"
        description={`Every brand conversation your agent is having for @${form.handle}. You approve before anything is signed.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button href="/creator" size="sm" color="secondary" iconLeading={Settings01}>
              My rules
            </Button>
            <Button size="sm" iconLeading={Stars01} onClick={getSampleOffers} isLoading={inviting} showTextWhileLoading>
              Get sample offers
            </Button>
          </div>
        }
      />
      {error && <p className="text-sm text-error-primary">{error}</p>}

      {items && items.length === 0 ? (
        <div className={cx(card, "space-y-4 px-6 py-16 text-center")}>
          <MessageChatCircle className="mx-auto size-8 text-fg-quaternary" />
          <h2 className="text-lg font-semibold text-primary">No brand has reached out yet</h2>
          <p className="mx-auto max-w-md text-sm text-tertiary">
            When a brand&apos;s agent makes an offer, the whole conversation shows up here. For the demo, three brands can reach out right now.
          </p>
          <Button size="lg" iconLeading={Stars01} onClick={getSampleOffers} isLoading={inviting} showTextWhileLoading>
            Get sample offers
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className={cx(card, "divide-y divide-secondary overflow-hidden")}>
            {(items ?? []).map((i) => (
              <li key={i.dealId}>
                <button
                  type="button"
                  onClick={() => setSelected(i.dealId)}
                  className={cx("flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary", i.dealId === selected && "bg-secondary")}
                >
                  <Avatar size="md" initials={i.brandName.slice(0, 2).toUpperCase()} />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-primary">{i.brandName}</span>
                      <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">
                        {i.status === "negotiating" ? (i.lastCash ? fmtUsd(i.lastCash) : "") : i.price ? fmtUsd(i.price) : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <BadgeWithDot size="sm" color={i.walkReason === "budget_gap" ? "warning" : i.walkReason === "not_a_fit" ? "gray" : STATUS[i.status].color}>
                        {i.walkReason === "budget_gap" ? "Needs your call" : i.walkReason === "not_a_fit" ? "Not a fit" : STATUS[i.status].label}
                      </BadgeWithDot>
                      {needsYou(i) && <BadgeWithDot size="sm" color="error">Needs your OK</BadgeWithDot>}
                    </span>
                    {i.lastMessage && <span className="line-clamp-2 block text-xs text-tertiary">{i.lastMessage}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section className="min-w-0">
            {active ? (
              <DealView key={active.dealId} creator={creator} existing={{ dealId: active.dealId, brandName: active.brandName }} perspective="creator" embedded />
            ) : (
              <p className="text-sm text-tertiary">Pick a conversation.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
