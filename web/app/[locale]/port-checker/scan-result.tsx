"use client";

import { useTranslations } from "next-intl";
import type { PortScanResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";

/**
 * Grid result card for common-ports / port-range modes. One small tile
 * per port: highlighted in green when open, with the service name
 * underneath when one is recognised.
 */
export function ScanResult({ result }: { result: PortScanResult }) {
  const t = useTranslations("ports");
  return (
    <ResultCard>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <div className="text-sm text-fg-muted">
            {result.target} → {result.resolvedIp}
          </div>
          <div className="text-lg">
            <span className="text-success font-semibold">
              {result.openCount}
            </span>
            <span className="text-fg-muted">
              {" / "}
              {result.totalChecked} {t("open")}
            </span>
          </div>
        </div>
        <div className="text-xs text-fg-muted">{result.totalMs}ms</div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {result.results.map((r) => (
          <div
            key={r.port}
            className={`rounded-lg border px-3 py-2 text-sm font-mono ${
              r.open
                ? "border-success/40 bg-success/5"
                : "border-border bg-bg-elevated"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{r.port}</span>
              <span
                className={
                  r.open ? "text-success text-xs" : "text-fg-subtle text-xs"
                }
              >
                {r.open ? t("open") : "—"}
              </span>
            </div>
            {r.service && (
              <div className="text-xs text-fg-muted">{r.service}</div>
            )}
          </div>
        ))}
      </div>
    </ResultCard>
  );
}
