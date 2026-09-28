import type { ReactNode } from "react";
import { Input } from "@/components/base/input/input";

/** One titled block of an onboarding form: label column on the left, fields on the right. */
export function FormSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-b border-secondary py-6 last:border-b-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
        {description && <p className="text-sm text-tertiary">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Whole-number USD / count field. */
export function NumberField({ label, hint, value, onChange, prefix }: { label: string; hint?: string; value: number; onChange: (n: number) => void; prefix?: string }) {
  return (
    <Input
      label={prefix ? `${label} (${prefix})` : label}
      hint={hint}
      type="number"
      inputMode="numeric"
      value={Number.isFinite(value) ? String(value) : ""}
      onChange={(v) => onChange(Math.max(0, Math.round(Number(v) || 0)))}
    />
  );
}

/** Small "Private" / "Public" marker next to a field group. */
export function Visibility({ kind }: { kind: "private" | "public" }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-secondary ring-1 ring-secondary ring-inset">
      {kind === "private" ? "Private: only your agent sees this" : "Public: the other side can see this"}
    </span>
  );
}
