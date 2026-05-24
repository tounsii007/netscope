"use client";

import { ResultCard } from "@/components/tool-shell";
import { CopyButton } from "@/components/copy-button";
import { Braces } from "lucide-react";

/**
 * Pretty-printed JSON viewer used by both the Header and Payload cards.
 * The colour accent flips between violet (header) and success green
 * (payload) so the two cards are instantly distinguishable side-by-side.
 *
 * The accent is applied to a small icon chip + the title; the JSON
 * itself stays in fg-muted on bg-elevated so it remains comfortable
 * to read regardless of which card it lives in.
 */
export function JsonCard({
  title,
  data,
  colorClass,
}: {
  title: string;
  data: unknown;
  colorClass: string;
}) {
  // Map the text colour to a matching chip tone so the icon background
  // doesn't have to be passed in separately.
  const chipTone = colorClass.includes("success")
    ? "bg-success/10 ring-success/25"
    : colorClass.includes("violet")
      ? "bg-violet-brand/10 ring-violet-brand/25"
      : "bg-brand/10 ring-brand/25";
  return (
    <ResultCard>
      <h3 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${colorClass}`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${chipTone}`}>
          <Braces className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {title}
        <CopyButton className="ml-auto" value={data ?? {}} />
      </h3>
      <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-bg-elevated/60 p-3 font-mono text-xs leading-relaxed text-fg-muted">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ResultCard>
  );
}
