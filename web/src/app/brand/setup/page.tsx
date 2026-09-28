"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { FormSection, NumberField, Visibility } from "@/components/app/form-section";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { type BrandForm, brandFormDefaults, parseProducts } from "@/lib/onboarding/profiles";
import { saveBrand, useSavedBrand } from "@/lib/onboarding/store";
import { brandSummary, buildFromText } from "@/lib/onboarding/ai";
import { ProfileSummary, TextIntake } from "@/lib/onboarding/text-intake";
import { fmtUsd } from "@/lib/format";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

export default function BrandSetupPage() {
  const saved = useSavedBrand();
  if (saved === undefined) return null; // first client render reads the saved form
  return <BrandSetup initial={saved ?? brandFormDefaults} hasSaved={!!saved} />;
}

function BrandSetup({ initial, hasSaved }: { initial: BrandForm; hasSaved: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<BrandForm>(initial);
  // The summary shows once there is something to summarize: a saved profile or a fresh AI build.
  const [built, setBuilt] = useState(hasSaved);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const set = <K extends keyof BrandForm>(k: K) => (v: BrandForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const problems = [
    !form.name.trim() && "Add your brand name.",
    form.maxPerCreator > form.totalBudget && "Max per creator is bigger than the total budget.",
    form.startingOffer > form.maxPerCreator && "Starting offer is above your max per creator.",
    form.reels + form.stories === 0 && "Ask for at least one reel or story.",
  ].filter(Boolean) as string[];
  const products = parseProducts(form.products);
  const save = () => {
    if (problems.length) return;
    saveBrand({ ...form, name: form.name.trim() });
    router.push("/brand/inbox");
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <PageHeader
        title="Your campaign"
        description="Set your budget and rules once. Your agent finds creators and negotiates each deal without revealing your limits."
      />

      <TextIntake
        placeholder="We are Cluely, an AI study app for students. $10k for 5 creators, 1 reel and 3 stories each, max $2,500 per creator, we can add a free year of Pro..."
        linkLabel="Your website"
        linkPlaceholder="https://cluely.com"
        build={async (text, url) => {
          setForm(await buildFromText("brand", text, url, built ? form : undefined));
          setBuilt(true);
        }}
        onManual={() => setDetailsOpen(true)}
      />

      {built && (
        <ProfileSummary
          title="Here is what your agent will work with"
          lines={brandSummary(form)}
          problem={problems[0]}
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
          <FormSection title="Your brand" description={<Visibility kind="public" />}>
            <Input label="Brand name" placeholder="Marine Layer" value={form.name} onChange={set("name")} isRequired />
            <Input label="Website" placeholder="https://" value={form.site} onChange={set("site")} />
            <Input label="What you sell" placeholder="apparel, beauty, software" value={form.category} onChange={set("category")} />
            <Input label="Target audience" value={form.audience} onChange={set("audience")} />
            <div className="sm:col-span-2">
              <TextArea label="How your brand talks" hint="Your agent writes in this voice." rows={2} value={form.voice} onChange={set("voice")} />
            </div>
          </FormSection>

          <FormSection title="The campaign" description={<Visibility kind="public" />}>
            <Input label="Campaign name" value={form.campaignName} onChange={set("campaignName")} />
            <Input label="Goal" value={form.goal} onChange={set("goal")} />
            <NumberField label="Reels per creator" value={form.reels} onChange={set("reels")} />
            <NumberField label="Stories per creator" value={form.stories} onChange={set("stories")} />
            <NumberField label="How many creators" value={form.creators} onChange={set("creators")} />
          </FormSection>

          <FormSection
            title="Budget"
            description={
              <span className="space-y-2">
                <Visibility kind="private" />
                <span className="block pt-1">Your agent opens at the starting offer and never goes past the max. Creators never see these numbers.</span>
              </span>
            }
          >
            <NumberField label="Total budget" prefix="USD" value={form.totalBudget} onChange={set("totalBudget")} />
            <NumberField label="Max per creator" prefix="USD" hint={form.creators ? `${fmtUsd(form.totalBudget / form.creators)} each if split evenly` : undefined} value={form.maxPerCreator} onChange={set("maxPerCreator")} />
            <NumberField label="Starting offer" prefix="USD" value={form.startingOffer} onChange={set("startingOffer")} />
          </FormSection>

          <FormSection title="Besides cash" description="Products, commission and perks your agent can trade instead of money.">
            <div className="sm:col-span-2">
              <TextArea
                label="Products or services"
                hint={`One per line: name, retail price, your cost. ${products.length} recognized.`}
                rows={3}
                value={form.products}
                onChange={set("products")}
              />
            </div>
            <NumberField label="Affiliate from" prefix="%" value={form.affiliateMin} onChange={set("affiliateMin")} />
            <NumberField label="Affiliate up to" prefix="%" value={form.affiliateMax} onChange={set("affiliateMax")} />
            <Input label="Perks" hint="Comma separated" value={form.perks} onChange={set("perks")} />
            <Input label="No-gos" hint="Comma separated" value={form.noGos} onChange={set("noGos")} />
          </FormSection>

          <div className="flex flex-wrap items-center justify-end gap-3 py-6">
            {problems[0] && <span className="text-sm text-error-primary">{problems[0]}</span>}
            <Button type="submit" size="lg" isDisabled={problems.length > 0}>
              Save and find creators
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
