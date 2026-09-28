import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Creator Deals</h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Two AI agents negotiate the sponsorship, one for the brand and one for the creator.
          Both start from real view data. The money moves only when the post is live.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>I&apos;m a brand</CardTitle>
            <CardDescription>
              Set a budget and rules once. Your agent finds creators, prices them, and negotiates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/brand/creators" className={buttonVariants({ className: "w-full" })}>
              Find creators
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>I&apos;m a creator</CardTitle>
            <CardDescription>
              See what your last 30 days are worth. Your agent answers offers so you don&apos;t get lowballed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/creator" className={buttonVariants({ variant: "outline", className: "w-full" })}>
              See my worth
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
