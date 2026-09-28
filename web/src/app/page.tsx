import { Button } from "@/components/base/buttons/button";
import { HeroTiles } from "@/components/app/hero-tiles";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-6">
        <h1 aria-label="Creator Deals">
          <HeroTiles words={["creator", "deals"]} />
        </h1>
        <p className="max-w-xl text-lg text-tertiary">
          Two AI agents negotiate the sponsorship, one for the brand and one for the creator. Both start from real view
          data. The money moves only when the post is live.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-6 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-primary">I&apos;m a brand</h2>
            <p className="text-sm text-tertiary">
              Set a budget and rules once. Your agent finds creators, prices them, and negotiates.
            </p>
          </div>
          <Button href="/brand/setup" size="lg" className="mt-auto">
            Set up my campaign
          </Button>
        </div>
        <div className="flex flex-col gap-6 rounded-xl bg-primary p-6 shadow-xs ring-1 ring-secondary ring-inset">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-primary">I&apos;m a creator</h2>
            <p className="text-sm text-tertiary">
              See what your last 30 days are worth. Your agent answers offers so you don&apos;t get lowballed.
            </p>
          </div>
          <Button href="/creator" size="lg" color="secondary" className="mt-auto">
            Set my deal rules
          </Button>
        </div>
      </div>
    </main>
  );
}
