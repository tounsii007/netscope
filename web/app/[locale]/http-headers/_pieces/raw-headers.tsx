/**
 * Raw-headers viewer — collapsible <pre> with the verbatim response
 * headers the upstream emitted. Mostly debug-useful: lets the user
 * verify the policy verdicts above against the wire-level reality.
 */

import { FileCode } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultCard } from "@/components/tool-shell";

export function RawHeaders({ rawHeaders }: { rawHeaders: Record<string, string> }) {
  const t = useTranslations("headers");
  return (
    <ResultCard>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
          <FileCode className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {t("raw_headers")}
      </h3>
      <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-bg-elevated/60 p-3 font-mono text-xs leading-relaxed text-fg-muted">
        {Object.entries(rawHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}
      </pre>
    </ResultCard>
  );
}
