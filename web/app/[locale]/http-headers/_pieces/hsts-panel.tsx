/**
 * HSTS policy detail panel. Surfaces the four fields a user needs to
 * decide whether the site is preload-eligible:
 *
 *   • max-age  — required ≥ 1 year for preload
 *   • includeSubDomains
 *   • preload
 *   • preloadEligible — server-computed verdict from the other three
 *
 * Only renders when the server reports an HSTS header at all; absent
 * HSTS is captured by the security-checks list above as a red X.
 */

import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultCard } from "@/components/tool-shell";
import type { HeadersResult } from "@/lib/api";
import { Stat, formatMaxAge } from "./stat";

export function HstsPanel({ hsts }: { hsts: NonNullable<HeadersResult["hsts"]> }) {
  const t = useTranslations("headers");
  return (
    <ResultCard>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {t("hsts_panel") || "HSTS policy"}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <Stat
          label={t("hsts_max_age") || "max-age"}
          value={hsts.maxAge >= 0 ? formatMaxAge(hsts.maxAge) : "—"}
        />
        <Stat label="includeSubDomains" value={hsts.includeSubDomains ? "yes" : "no"} ok={hsts.includeSubDomains} />
        <Stat label="preload"           value={hsts.preload           ? "yes" : "no"} ok={hsts.preload} />
        <Stat
          label={t("hsts_preload_eligible") || "Preload-eligible"}
          value={hsts.preloadEligible ? "yes" : "no"}
          ok={hsts.preloadEligible}
        />
      </div>
    </ResultCard>
  );
}
