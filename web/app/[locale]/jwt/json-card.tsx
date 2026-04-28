"use client";

import { ResultCard } from "@/components/tool-shell";

/**
 * Pretty-printed JSON viewer used by both the Header and Payload cards.
 * The colour accent flips between brand orange and success green so the
 * two cards are instantly distinguishable when placed side by side.
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
  return (
    <ResultCard>
      <h3 className={`mb-2 text-sm font-semibold ${colorClass}`}>{title}</h3>
      <pre className="max-h-80 overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ResultCard>
  );
}
