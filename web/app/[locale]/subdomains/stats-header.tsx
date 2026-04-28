"use client";

import type { SubdomainsResult } from "@/lib/api";
import { StatsDisplay } from "@/app/[locale]/subdomains/stats-display";
import { ActionsBar } from "@/app/[locale]/subdomains/actions-bar";

/**
 * Header strip above the subdomain list. Slim wrapper that lays out
 * the stats display on the left and the actions bar on the right —
 * the heavy lifting lives in the two children.
 */
export function StatsHeader({
  data,
  filter,
  onFilterChange,
  filteredCount,
  depthDistribution,
}: {
  data: SubdomainsResult;
  filter: string;
  onFilterChange: (v: string) => void;
  filteredCount: number;
  depthDistribution: [number, number][] | null;
}) {
  return (
    <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <StatsDisplay
        data={data}
        filter={filter}
        filteredCount={filteredCount}
        depthDistribution={depthDistribution}
      />
      <ActionsBar
        data={data}
        filter={filter}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}
