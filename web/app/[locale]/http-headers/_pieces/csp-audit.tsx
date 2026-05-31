/**
 * CSP audit panel. Highlights the three classic CSP red flags:
 *   • `unsafe-inline` — neutralises the policy against most XSS
 *   • `unsafe-eval`   — opens the door to runtime-generated code
 *   • wildcard `*` sources — defeat the source-whitelist entirely
 *
 * Only renders when the server actually returned a CSP header.
 */

import { Code2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultCard } from "@/components/tool-shell";
import type { HeadersResult } from "@/lib/api";
import { Stat } from "./stat";

export function CspAudit({ csp }: { csp: NonNullable<HeadersResult["csp"]> }) {
  const t = useTranslations("headers");
  return (
    <ResultCard>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {t("csp_panel") || "CSP audit"}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <Stat label={t("csp_directives") || "Directives"} value={String(csp.directiveCount)} />
        <Stat label={"'unsafe-inline'"} value={csp.hasUnsafeInline ? "present" : "absent"} ok={!csp.hasUnsafeInline} />
        <Stat label={"'unsafe-eval'"}   value={csp.hasUnsafeEval   ? "present" : "absent"} ok={!csp.hasUnsafeEval} />
        <Stat label={t("csp_wildcard") || "Wildcard sources"} value={csp.hasWildcard ? "present" : "absent"} ok={!csp.hasWildcard} />
      </div>
    </ResultCard>
  );
}
