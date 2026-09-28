"use client";

import type { Creator } from "@shared/contract";
import { Table, TableCard } from "@/components/application/table/table";
import { AvatarLabelGroup } from "@/components/base/avatar/avatar-label-group";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/format";

const initials = (c: Creator) => (c.name ?? c.handle).replace("@", "").slice(0, 2).toUpperCase();

export function CreatorsTable({ creators }: { creators: Creator[] }) {
  return (
    <TableCard.Root>
      <TableCard.Header
        title="Creators"
        badge={`${creators.length} found`}
        description="Ranked by fair price, from each creator's last 30 days of reels."
      />
      <Table aria-label="Creators">
        <Table.Header>
          <Table.Head id="creator" label="Creator" isRowHeader className="w-full" />
          <Table.Head id="followers" label="Followers" />
          <Table.Head id="views" label="Typical views (30d)" />
          <Table.Head id="engagement" label="Engagement" />
          <Table.Head id="reels" label="Reels (30d)" />
          <Table.Head id="price" label="Fair price" />
          <Table.Head id="actions" />
        </Table.Header>
        <Table.Body items={creators.map((c) => ({ ...c, id: c.handle }))}>
          {(c) => (
            <Table.Row id={c.id}>
              <Table.Cell>
                <AvatarLabelGroup
                  size="md"
                  src={c.avatarUrl}
                  initials={initials(c)}
                  alt=""
                  title={c.name ?? c.handle}
                  subtitle={
                    <span className="flex items-center gap-2">
                      {c.handle}
                      <Badge size="sm" color="gray">
                        {c.platform === "tiktok" ? "TikTok" : "Instagram"}
                      </Badge>
                    </span>
                  }
                />
              </Table.Cell>
              <Table.Cell className="tabular-nums">{fmtCompact(c.followers)}</Table.Cell>
              <Table.Cell className="tabular-nums">{fmtCompact(c.avgViews30d)}</Table.Cell>
              <Table.Cell className="tabular-nums">{fmtPct(c.engagement)}</Table.Cell>
              <Table.Cell className="tabular-nums">{c.posts30d ?? "-"}</Table.Cell>
              <Table.Cell className="font-semibold text-primary tabular-nums">{fmtUsd(c.fairPrice)}</Table.Cell>
              <Table.Cell className="px-4">
                <Button size="sm" color="secondary" href={`/deals/${c.handle.replace("@", "")}`}>
                  Negotiate
                </Button>
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}
