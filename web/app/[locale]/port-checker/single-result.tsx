"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import type { PortCheckResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";

/**
 * Big-icon result card for the single-port mode. Displays the open /
 * closed state, the resolved IP for the host, latency and any service
 * hint we recognised on that port.
 */
export function SinglePortResult({ result }: { result: PortCheckResult }) {
  const t = useTranslations("ports");

  return (
    <ResultCard>
      <div className="flex items-center gap-3">
        {result.open ? (
          <CheckCircle2 className="h-8 w-8 text-success" />
        ) : (
          <XCircle className="h-8 w-8 text-danger" />
        )}
        <div>
          <div className="text-lg font-medium">
            {t.rich("port_status", {
              port: result.port,
              status: result.open
                ? t("open").toUpperCase()
                : t("closed").toUpperCase(),
              s: (chunks) => (
                <span className={result.open ? "text-success" : "text-danger"}>
                  {chunks}
                </span>
              ),
            })}
          </div>
          <div className="font-mono text-sm text-fg-muted">
            {result.target} → {result.resolvedIp}
            {result.latencyMs != null && <> · {result.latencyMs}ms</>}
            {result.service && <> · {result.service}</>}
          </div>
        </div>
      </div>
    </ResultCard>
  );
}
