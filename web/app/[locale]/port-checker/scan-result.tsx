"use client";

import { useTranslations } from "next-intl";
import { Zap, ArrowRight } from "lucide-react";
import type { PortScanResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";

/**
 * Grid result card for common-ports / port-range modes. One small tile
 * per port: highlighted in green when open, with the service name
 * underneath when one is recognised.
 *
 * Header summarises target / resolved IP, a "X of Y open" counter, and
 * total elapsed time. Counter uses brand colour numerals + muted text
 * so the open-count is the loudest number on the card.
 */
export function ScanResult({ result }: { result: PortScanResult }) {
  const t = useTranslations("ports");
  return (
    <ResultCard>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2 py-1 text-xs">
            <span className="font-mono text-fg-muted">{result.target}</span>
            <ArrowRight className="h-3 w-3 text-fg-subtle" aria-hidden="true" />
            <span className="font-mono text-fg">{result.resolvedIp}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold text-success">
              {result.openCount}
            </span>
            <span className="text-sm text-fg-muted">
              / {result.totalChecked} {t("open")}
            </span>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2 py-1 text-xs">
          <Zap className="h-3 w-3 text-warn" aria-hidden="true" />
          <span className="font-mono text-fg">{result.totalMs}ms</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {result.results.map((r) => (
          <div
            key={r.port}
            className={`group rounded-lg border px-3 py-2 text-sm transition hover:scale-[1.02] ${
              r.open
                ? "border-success/40 bg-success/8 ring-1 ring-success/20"
                : "border-border bg-bg-elevated/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-fg">{r.port}</span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  r.open ? "text-success" : "text-fg-subtle"
                }`}
              >
                {r.open ? t("open") : "—"}
              </span>
            </div>
            {r.service && (
              <div className="mt-0.5 truncate text-[11px] text-fg-muted">
                {r.service}
              </div>
            )}
          </div>
        ))}
      </div>
    </ResultCard>
  );
}
