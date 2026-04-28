"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type { SubdomainsResult } from "@/lib/api";

/**
 * Left-half of the stats header: big count, source/duration footnote,
 * truncation warning when the result was capped, and depth-distribution
 * badges (L0, L1, L2 …) showing how many subdomains live at each level
 * below the apex.
 */
export function StatsDisplay({
  data,
  filter,
  filteredCount,
  depthDistribution,
}: {
  data: SubdomainsResult;
  filter: string;
  filteredCount: number;
  depthDistribution: [number, number][] | null;
}) {
  const t = useTranslations("subdomains");

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <div className="text-3xl font-semibold tabular-nums">
          {data.count.toLocaleString()}
        </div>
        <div className="text-sm text-fg-muted">
          {t("count", { count: data.count })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {data.source}
        </span>
        <span>·</span>
        <span>{data.durationMs}ms</span>
        {filter && (
          <>
            <span>·</span>
            <span>
              {filteredCount.toLocaleString()} /{" "}
              {data.count.toLocaleString()} {t("filter_match_label")}
            </span>
          </>
        )}
      </div>
      {data.truncated && (
        <div className="inline-flex items-center gap-1.5 rounded-md bg-warn/10 px-2 py-1 text-xs text-warn">
          <Info className="h-3 w-3" />
          {t("truncated_notice")}
        </div>
      )}
      {depthDistribution && depthDistribution.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {depthDistribution.map(([depth, n]) => (
            <span
              key={depth}
              className="rounded-md border border-border bg-bg-elevated px-2 py-0.5 text-[11px] text-fg-muted tabular-nums"
              title={t("depth_label", { depth })}
            >
              L{depth}: {n.toLocaleString()}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
