import Link from "next/link";
import { getCreators } from "@/lib/creators";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Hardcoded until /brand/setup exists
const BUDGET = 20_000;

export const dynamic = "force-dynamic";

export default function CreatorsPage() {
  const { creators, source } = getCreators();
  const total = creators.reduce((s, c) => s + c.fairPrice, 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Creator Deals
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Creators</h1>
          <p className="text-muted-foreground">
            Ranked by fair price, from each creator&apos;s last 30 days of reels.
          </p>
        </div>
        <Badge variant={source === "apify" ? "secondary" : "destructive"}>
          {source === "apify" ? "Live data from Apify" : "Fake data: run npm run scrape"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>
            Fair price for all {creators.length} creators is {fmtUsd(total)} of your {fmtUsd(BUDGET)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={Math.min(100, (total / BUDGET) * 100)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Creator</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead className="text-right">Avg views (30d)</TableHead>
                <TableHead className="text-right">Engagement</TableHead>
                <TableHead className="text-right">Reels (30d)</TableHead>
                <TableHead className="text-right">Fair price</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.map((c, i) => (
                <TableRow key={c.handle}>
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {c.avatarUrl && <AvatarImage src={c.avatarUrl} alt="" />}
                        <AvatarFallback>{(c.name ?? c.handle).replace("@", "").slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name ?? c.handle}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {c.handle}
                          <Badge variant="outline" >{c.platform === "tiktok" ? "TikTok" : "Instagram"}</Badge>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCompact(c.followers)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCompact(c.avgViews30d)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(c.engagement)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.posts30d ?? "-"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtUsd(c.fairPrice)}</TableCell>
                  <TableCell className="text-right">
                    {/* Negotiation page comes in step 2 */}
                    <Button size="sm" variant="outline" disabled>
                      Negotiate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
