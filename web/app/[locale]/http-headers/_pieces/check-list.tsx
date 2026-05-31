/**
 * Security-checks list: one row per audited header (X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, …) with a coloured
 * icon + value chip + weight badge.
 *
 * Visual states:
 *   • good (header present + healthy value)       → green check
 *   • present-but-weak (header present, soft fail) → amber alert
 *   • absent                                      → red X
 *
 * The numeric `+weight` is the contribution to the overall score —
 * surfacing it lets users see why their grade isn't moving when they
 * fix a low-weight header but ignore the heavy hitters (CSP, HSTS).
 */

import { Shield, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultCard } from "@/components/tool-shell";
import type { HeadersResult } from "@/lib/api";

type Check = HeadersResult["checks"][number];

export function CheckList({ checks }: { checks: Check[] }) {
  const t = useTranslations("headers");
  return (
    <ResultCard>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {t("security_checks")}
      </h3>
      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.header}
            className={`rounded-xl border ${tone(c)} p-3`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">{icon(c)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <code className="text-sm font-semibold text-fg">{c.header}</code>
                  <span className="shrink-0 rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-muted ring-1 ring-border">
                    +{c.weight}
                  </span>
                </div>
                {c.value && (
                  <div className="mt-1.5 break-all rounded-md bg-bg-elevated/60 px-2 py-1 font-mono text-[11px] text-fg-muted">
                    {c.value}
                  </div>
                )}
                {!c.good && c.detail && (
                  <div className="mt-1.5 text-xs text-fg-muted">{c.detail}</div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ResultCard>
  );
}

function tone(c: Check) {
  return c.good
    ? "border-success/30 bg-success/5"
    : c.present
      ? "border-warn/30 bg-warn/5"
      : "border-danger/30 bg-danger/5";
}

function icon(c: Check) {
  if (c.good)    return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />;
  if (c.present) return <AlertCircle  className="h-4 w-4 text-warn"    aria-hidden="true" />;
  return            <XCircle        className="h-4 w-4 text-danger"  aria-hidden="true" />;
}
