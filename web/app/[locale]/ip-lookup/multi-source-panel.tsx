"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Database } from "lucide-react";
import { api, type IpMultiSourceResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { ConsensusBar } from "./multi-source/consensus-bar";
import { SourceCard } from "./multi-source/source-card";

/**
 * Side-by-side comparison of multiple geolocation providers for the
 * same IP. The backend dispatches every configured provider in parallel
 * with a ~3 s per-provider deadline; this component renders one expandable
 * card per provider plus a consensus header so the user can spot which
 * fields the providers agree on (typically country) versus diverge on
 * (typically city/postal for residential IPs and ASN-mapping for CGNAT).
 *
 * Owns only the fetch + which-card-is-open state; ConsensusBar and
 * SourceCard are self-contained.
 */
export function MultiSourcePanel({ ip }: { ip: string }) {
  const t = useTranslations("ip");
  const [data, setData] = useState<IpMultiSourceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-fetch whenever the parent IP changes. Cheap (12-h server cache),
  // so we don't gate behind a button click.
  useEffect(() => {
    if (!ip) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setData(null);
    api
      .ipSources(ip)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        // Pre-expand the first successful source so users see something
        // useful immediately without an extra click.
        const firstOk = res.sources.find((s) => s.ok);
        if (firstOk) setExpanded(new Set([firstOk.source]));
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ip]);

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading) {
    return (
      <ResultCard>
        <div className="flex items-center gap-3 text-sm text-fg-muted">
          <Spinner />
          <span>{t("multi_loading")}</span>
        </div>
      </ResultCard>
    );
  }

  if (err) {
    return (
      <ResultCard className="border-danger/40 text-danger">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          {err}
        </div>
      </ResultCard>
    );
  }

  if (!data || data.sources.length === 0) return null;

  return (
    <ResultCard>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4 text-brand" />
            {t("multi_title")}
          </h3>
          <p className="mt-0.5 text-xs text-fg-muted">{t("multi_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-fg-muted">
          <span>
            {t("multi_summary", {
              ok: data.successCount,
              total: data.sourceCount,
            })}
          </span>
          <span>·</span>
          <span>{data.durationMs}ms</span>
          {data.cached && (
            <span className="rounded-md bg-bg-elevated px-1.5 py-0.5">
              {t("multi_cached")}
            </span>
          )}
        </div>
      </div>

      <ConsensusBar sources={data.sources} />

      <div className="mt-4 space-y-2">
        {data.sources.map((s) => (
          <SourceCard
            key={s.source}
            entry={s}
            isOpen={expanded.has(s.source)}
            onToggle={() => toggle(s.source)}
          />
        ))}
      </div>
    </ResultCard>
  );
}
