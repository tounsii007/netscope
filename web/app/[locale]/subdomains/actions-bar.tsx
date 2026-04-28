"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Copy, Check } from "lucide-react";
import type { SubdomainsResult } from "@/lib/api";
import { ExportMenu } from "@/app/[locale]/subdomains/export-menu";

/**
 * Right-half of the stats header: live filter input with a clear-X
 * button, "Copy all" with transient ✓ feedback, and the export-menu
 * dropdown. Owns its own copy-all state because it's a pure
 * micro-interaction the parent doesn't need to track.
 */
export function ActionsBar({
  data,
  filter,
  onFilterChange,
}: {
  data: SubdomainsResult;
  filter: string;
  onFilterChange: (v: string) => void;
}) {
  const t = useTranslations("subdomains");
  const tc = useTranslations("common");
  const [copiedAll, setCopiedAll] = useState(false);

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(data.subdomains.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      /* clipboard blocked — silent fail */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          className="input !pl-10 !pr-9 w-full"
          placeholder={t("filter_placeholder")}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          aria-label={t("filter_placeholder")}
        />
        {filter && (
          <button
            type="button"
            onClick={() => onFilterChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:bg-bg-elevated hover:text-fg"
            aria-label={tc("clear")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={copyAll}
        className="btn-ghost"
        title={t("copy_all")}
      >
        {copiedAll ? (
          <>
            <Check className="h-4 w-4 text-success" />
            {tc("copied")}
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            {t("copy_all")}
          </>
        )}
      </button>

      <ExportMenu data={data} />
    </div>
  );
}
