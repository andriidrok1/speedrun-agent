"use client";
// Text-first onboarding UI shared by the brand and creator setup pages:
// one big "tell us" box that builds the form, and a plain-sentence summary of the result.
import { useState } from "react";
import { Lock01, Stars02 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import type { SummaryLine } from "./ai";

const card = "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset";

export function TextIntake({
  placeholder,
  linkLabel,
  linkPlaceholder,
  build,
  onManual,
}: {
  placeholder: string;
  linkLabel: string;
  linkPlaceholder: string;
  /** Calls the server and applies the result; throws on failure. */
  build: (text: string, url: string) => Promise<void>;
  onManual: () => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await build(text.trim(), url.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={`${card} space-y-4 p-6`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextArea label="Tell us in your own words" placeholder={placeholder} rows={6} value={text} onChange={setText} isDisabled={loading} />
      <Input label={linkLabel} hint="Optional" placeholder={linkPlaceholder} value={url} onChange={setUrl} isDisabled={loading} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tertiary">
          {loading ? "Reading what you wrote and filling in your profile..." : "Numbers you leave out get sensible defaults. You can check everything next."}
        </p>
        <Button type="submit" size="lg" iconLeading={Stars02} isLoading={loading} showTextWhileLoading isDisabled={!text.trim()}>
          Build my profile
        </Button>
      </div>
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-error-primary p-3 text-sm text-error-primary">
          <span>Could not build your profile: {error}</span>
          <Button color="link-color" size="sm" onClick={onManual}>
            Fill in the details myself
          </Button>
        </div>
      )}
    </form>
  );
}

export function ProfileSummary({
  title,
  lines,
  problem,
  saveLabel = "Looks right, save",
  onSave,
  onEdit,
  editOpen,
  footer,
}: {
  title: string;
  lines: SummaryLine[];
  problem?: string;
  saveLabel?: string;
  onSave: () => void;
  onEdit: () => void;
  editOpen: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <section className={`${card} space-y-5 p-6`}>
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      <ul className="space-y-3">
        {lines.map((l) => (
          <li key={l.text} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-md text-secondary">
            <span>{l.text}</span>
            {l.private && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary">
                <Lock01 className="size-3" aria-hidden /> Private
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-tertiary">
        {lines.some((l) => l.private)
          ? "Private items are only seen by your own agent. The other side never sees them."
          : "Everything here is public: brands see your rules before they reach out, so only brands that fit get in touch."}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-secondary pt-5">
        {problem && <span className="text-sm text-error-primary">{problem}</span>}
        {footer}
        <Button color="secondary" size="lg" onClick={onEdit}>
          {editOpen ? "Hide details" : "Edit details"}
        </Button>
        <Button size="lg" onClick={onSave} isDisabled={!!problem}>
          {saveLabel}
        </Button>
      </div>
    </section>
  );
}
