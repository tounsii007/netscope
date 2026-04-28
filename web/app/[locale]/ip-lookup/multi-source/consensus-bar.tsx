"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { IpSourceEntry } from "@/lib/api";

/**
 * Compact agreement bar above the source list. For each interesting
 * field (country / city / ASN), shows the most-common value and how
 * many providers reported it — green when everyone agrees, amber on
 * any divergence. Lets the user see at a glance whether providers
 * agree on this IP or wildly disagree.
 */
export function ConsensusBar({ sources }: { sources: IpSourceEntry[] }) {
  const t = useTranslations("ip");

  const stats = useMemo(() => {
    const ok = sources.filter((s) => s.ok && s.data);
    if (ok.length === 0) return null;
    const tally = (key: string): [string, number] | null => {
      const map = new Map<string, number>();
      for (const s of ok) {
        const v = String(s.data?.[key] ?? "").trim();
        if (!v) continue;
        map.set(v, (map.get(v) ?? 0) + 1);
      }
      const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
      return sorted[0] ?? null;
    };
    return {
      country: tally("country"),
      city: tally("city"),
      asn: tally("asn"),
      total: ok.length,
    };
  }, [sources]);

  if (!stats || stats.total === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-bg-elevated/50 p-3 text-xs">
      <ConsensusPill label={t("multi_country")} top={stats.country} total={stats.total} />
      <ConsensusPill label={t("multi_city")} top={stats.city} total={stats.total} />
      <ConsensusPill label={t("multi_asn")} top={stats.asn} total={stats.total} />
    </div>
  );
}

function ConsensusPill({
  label,
  top,
  total,
}: {
  label: string;
  top: [string, number] | null;
  total: number;
}) {
  if (!top) {
    return (
      <span className="rounded-md bg-bg-card px-2 py-1 text-fg-subtle">
        {label}: —
      </span>
    );
  }
  const [value, count] = top;
  const allAgree = count === total;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${
        allAgree ? "bg-success/10 text-success" : "bg-warn/10 text-warn"
      }`}
    >
      <span className="text-fg-muted">{label}:</span>
      <span className="font-medium">{value}</span>
      <span className="tabular-nums opacity-75">{count}/{total}</span>
    </span>
  );
}
