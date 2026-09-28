import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <Link href="/" className="text-sm font-semibold text-tertiary hover:text-secondary">
          Creator Deals
        </Link>
        <h1 className="text-display-xs font-semibold text-primary">{title}</h1>
        {description && <p className="text-md text-tertiary">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
