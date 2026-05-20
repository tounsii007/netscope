"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle, Zap } from "lucide-react";
import type { PortCheckResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";

/**
 * Big-icon result card for the single-port mode. Displays the open /
 * closed state, the resolved IP for the host, latency and any service
 * hint we recognised on that port.
 *
 * Visual treatment: a glowing status icon, the headline status sentence,
 * and a metadata strip of three chips (resolved IP, latency, service).
 * The card itself adopts a faint state-tinted left border so users can
 * scan the open/closed state at a glance.
 */
export function SinglePortResult({ result }: { result: PortCheckResult }) {
  const t = useTranslations("ports");
  const ok = result.open;
  const tone = ok ? "border-success/40" : "border-danger/40";
  const iconBg = ok
    ? "bg-success/10 text-success ring-success/30"
    : "bg-danger/10 text-danger ring-danger/30";

  return (
    <ResultCard className={`relative overflow-hidden border-l-4 ${tone}`}>
      <div className="flex items-center gap-4">
        <span
          className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ${iconBg}`}
        >
          {ok ? (
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          ) : (
            <XCircle className="h-7 w-7" aria-hidden="true" />
          )}
          {ok && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-2xl ring-1 ring-success/40 animate-ping-slow preserve-motion"
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-fg sm:text-xl">
            {t.rich("port_status", {
              port: result.port,
              status: ok ? t("open").toUpperCase() : t("closed").toUpperCase(),
              s: (chunks) => (
                <span className={ok ? "text-success" : "text-danger"}>
                  {chunks}
                </span>
              ),
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
            <Chip>
              <span className="text-fg-subtle">{result.target}</span>
              <span aria-hidden="true" className="text-fg-subtle/50">→</span>
              <span className="font-mono text-fg">{result.resolvedIp}</span>
            </Chip>
            {result.latencyMs != null && (
              <Chip>
                <Zap className="h-3 w-3 text-warn" aria-hidden="true" />
                <span className="font-mono text-fg">{result.latencyMs}ms</span>
              </Chip>
            )}
            {result.service && (
              <Chip className="text-cyan-soft">
                <span className="font-mono">{result.service}</span>
              </Chip>
            )}
          </div>
        </div>
      </div>
    </ResultCard>
  );
}

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2 py-1 text-fg-muted ${className}`}
    >
      {children}
    </span>
  );
}
