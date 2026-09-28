"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Creator } from "@shared/contract";
import { PageHeader } from "@/components/app/page-header";
import { FormSection, NumberField, Visibility } from "@/components/app/form-section";
import { AvatarLabelGroup } from "@/components/base/avatar/avatar-label-group";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { type CreatorForm, creatorFormDefaults } from "@/lib/onboarding/profiles";
import { saveCreator, useSavedCreator } from "@/lib/onboarding/store";
import { buildFromText, creatorSummary } from "@/lib/onboarding/ai";
import { ProfileSummary, TextIntake } from "@/lib/onboarding/text-intake";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

export function CreatorSetup({ creators }: { creators: Creator[] }) {
  const saved = useSavedCreator();
  if (saved === undefined) return null; // first client render reads the saved form
  return <CreatorSetupForm creators={creators} initial={saved ? { ...creatorFormDefaults(creators[0]), ...saved } : creatorFormDefaults(creators[0])} hasSaved={!!saved} />;
}

const findCreator = (creators: Creator[], handle: string) => creators.find((c) => c.handle.replace("@", "").toLowerCase() === handle.trim().replace("@", "").toLowerCase());

function CreatorSetupForm({ creators, initial, hasSaved }: { creators: Creator[]; initial: CreatorForm; hasSaved: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<CreatorForm>(initial);
  // The summary shows once there is something to summarize: a saved profile or a fresh AI build.
  const [built, setBuilt] = useState(hasSaved);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const set = <K extends keyof CreatorForm>(k: K) => (v: CreatorForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const stats = useMemo(() => findCreator(creators, form.handle), [creators, form.handle]);

  // Picking a known handle pre-fills name and prices from the real numbers.
  function pickHandle(v: string) {
    const match = creators.find((c) => c.handle.replace("@", "").toLowerCase() === v.trim().toLowerCase());
    setForm((f) => (match && match.handle.replace("@", "") !== f.handle ? { ...creatorFormDefaults(match), voice: f.voice, refuses: f.refuses, dealbreakers: f.dealbreakers, favoriteBrands: f.favoriteBrands } : { ...f, handle: v.replace("@", "") }));
  }

  const tooLow = form.minReel > form.idealReel || form.minStory > form.idealStory || form.minPost > form.idealPost;
  const favTooHigh = form.favoriteMinReel > form.minReel || form.favoriteMinStory > form.minStory || form.favoriteMinPost > form.minPost;
  const problem = !form.handle.trim()
    ? "Add your Instagram handle."
    : tooLow
      ? "A minimum is higher than its ideal price."
      : favTooHigh
        ? "A favorite brand minimum is higher than your normal minimum."
        : undefined;
  const save = () => {
    if (problem) return;
    saveCreator({ ...form, handle: form.handle.trim().replace("@", "") });
    router.push("/creator/inbox");
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <PageHeader
        title="Your deal rules"
        description="Set these once. Your agent negotiates every brand offer with them and never tells a brand your minimums."
      />

      <TextIntake
        placeholder="I'm @nicktarmo, lifestyle and tech. I charge about $1,000 for a reel, never under $700, no gambling or crypto..."
        linkLabel="Your Instagram"
        linkPlaceholder="https://instagram.com/nicktarmo"
        build={async (text, url) => {
          const next = await buildFromText("creator", text, url, built ? form : undefined);
          const match = findCreator(creators, next.handle);
          setForm({ ...next, name: next.name || match?.name || "" });
          setBuilt(true);
        }}
        onManual={() => setDetailsOpen(true)}
      />

      {stats && (
        <div className={`${card} flex flex-wrap items-center justify-between gap-6 p-6`}>
          <AvatarLabelGroup
            size="lg"
            src={stats.avatarUrl}
            initials={(stats.name ?? stats.handle).replace("@", "").slice(0, 2).toUpperCase()}
            alt=""
            title={stats.name ?? stats.handle}
            subtitle={`${stats.handle}, last 30 days`}
          />
          <dl className="flex flex-wrap gap-8">
            <Stat label="Followers" value={fmtCompact(stats.followers)} />
            <Stat label="Avg views" value={fmtCompact(stats.avgViews30d)} />
            <Stat label="Engagement" value={fmtPct(stats.engagement)} />
            <Stat label="Fair price per reel" value={fmtUsd(stats.fairPrice)} strong />
          </dl>
        </div>
      )}

      {built && (
        <ProfileSummary
          title="Here is what your agent will work with"
          lines={creatorSummary(form)}
          problem={problem}
          onSave={save}
          onEdit={() => setDetailsOpen((o) => !o)}
          editOpen={detailsOpen}
        />
      )}

      {detailsOpen && (
        <form
          className={`${card} px-6`}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormSection title="Who you are" description={<Visibility kind="public" />}>
            <Input label="Instagram handle" placeholder="nicktarmo" value={form.handle} onChange={pickHandle} isRequired />
            <Input label="Name" value={form.name} onChange={set("name")} />
            <Input label="Niche" placeholder="fitness, tech, lifestyle" value={form.niche} onChange={set("niche")} />
            <div className="sm:col-span-2">
              <TextArea label="How you talk to brands" hint="Your agent writes in this voice." rows={3} value={form.voice} onChange={set("voice")} />
            </div>
          </FormSection>

          <FormSection title="Your prices" description={<span className="space-y-2"><Visibility kind="public" /><br /><span className="block pt-1">Ideal prices are your public rate card. Your agent opens here.</span></span>}>
            <NumberField label="Reel" prefix="USD" value={form.idealReel} onChange={set("idealReel")} />
            <NumberField label="Story" prefix="USD" value={form.idealStory} onChange={set("idealStory")} />
            <NumberField label="Feed post" prefix="USD" value={form.idealPost} onChange={set("idealPost")} />
          </FormSection>

          <FormSection title="Your minimums" description={<span className="space-y-2"><Visibility kind="private" /><br /><span className="block pt-1">Your agent never goes below these, and never says them out loud.</span></span>}>
            <NumberField label="Lowest for a reel" prefix="USD" value={form.minReel} onChange={set("minReel")} />
            <NumberField label="Lowest for a story" prefix="USD" value={form.minStory} onChange={set("minStory")} />
            <NumberField label="Lowest for a post" prefix="USD" value={form.minPost} onChange={set("minPost")} />
            {tooLow && <p className="text-sm text-error-primary sm:col-span-2">A minimum is higher than its ideal price. Lower the minimum or raise the ideal.</p>}
          </FormSection>

          <FormSection
            title="Favorite brands"
            description={
              <span className="space-y-2">
                <Visibility kind="private" />
                <br />
                <span className="block pt-1">Brands you would go lower for. Leave a field at 0 to use your normal minimum.</span>
              </span>
            }
          >
            <div className="sm:col-span-2">
              <Input label="Brands" placeholder="OpenAI, Anthropic" hint="Comma separated" value={form.favoriteBrands} onChange={set("favoriteBrands")} />
            </div>
            <NumberField label="Lowest reel for them" prefix="USD" value={form.favoriteMinReel} onChange={set("favoriteMinReel")} />
            <NumberField label="Lowest story for them" prefix="USD" value={form.favoriteMinStory} onChange={set("favoriteMinStory")} />
            <NumberField label="Lowest post for them" prefix="USD" value={form.favoriteMinPost} onChange={set("favoriteMinPost")} />
          </FormSection>

          <FormSection title="What you accept" description={<Visibility kind="private" />}>
            <div className="space-y-3 sm:col-span-2">
              <Checkbox label="Free products or services can count toward the price" isSelected={form.openToProducts} onChange={set("openToProducts")} />
              <Checkbox label="Affiliate commission can count toward the price" isSelected={form.openToAffiliate} onChange={set("openToAffiliate")} />
            </div>
            <Input label="Never work with" hint="Categories or brands, comma separated" value={form.refuses} onChange={set("refuses")} />
            <Input label="Dealbreakers" hint="Terms you always refuse" value={form.dealbreakers} onChange={set("dealbreakers")} />
          </FormSection>

          <div className="flex flex-wrap items-center justify-end gap-3 py-6">
            {favTooHigh && <span className="text-sm text-error-primary">A favorite brand minimum is higher than your normal minimum.</span>}
            <Button type="submit" size="lg" isDisabled={!!problem}>
              Save my rules
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-tertiary">{label}</dt>
      <dd className={`text-lg tabular-nums ${strong ? "font-semibold text-brand-secondary" : "font-semibold text-primary"}`}>{value}</dd>
    </div>
  );
}
