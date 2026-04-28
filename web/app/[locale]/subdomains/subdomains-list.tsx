"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";
import { highlight } from "./highlight";

/**
 * Scrollable, sticky-header list of subdomains. Each row exposes a
 * copy-this-one button and a quick "→ IP-Lookup" link on hover, kept
 * out-of-the-way until the row is hovered or focused so scanning long
 * lists isn't visually noisy.
 */
export function SubdomainsList({
  filter,
  onClearFilter,
  filtered,
  totalCount,
}: {
  filter: string;
  onClearFilter: () => void;
  filtered: string[];
  totalCount: number;
}) {
  const t = useTranslations("subdomains");
  const tc = useTranslations("common");
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  async function copyOne(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      setCopiedRow(s);
      setTimeout(
        () => setCopiedRow((cur) => (cur === s ? null : cur)),
        1200
      );
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="max-h-[560px] overflow-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg-card/95 px-3 py-2 text-xs text-fg-muted backdrop-blur">
          <span>
            {filter
              ? t("showing_filtered", {
                  shown: filtered.length,
                  total: totalCount,
                })
              : t("showing_total", { total: totalCount })}
          </span>
          {filter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="text-brand hover:underline"
            >
              {tc("clear")}
            </button>
          )}
        </div>
        <ul className="divide-y divide-border/40 font-mono text-sm">
          {filtered.map((s, idx) => (
            <li
              key={s}
              className="group flex items-center gap-3 px-3 py-2 hover:bg-bg-elevated"
            >
              <span className="w-10 shrink-0 select-none text-right text-xs tabular-nums text-fg-subtle">
                {idx + 1}
              </span>
              <span className="flex-1 break-all">
                {filter ? highlight(s, filter) : s}
              </span>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => copyOne(s)}
                  className="rounded p-1 text-fg-subtle hover:bg-bg-base hover:text-fg"
                  title={tc("copy")}
                  aria-label={tc("copy")}
                >
                  {copiedRow === s ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={`/ip-lookup?host=${encodeURIComponent(s)}`}
                  className="rounded px-2 py-1 text-xs text-fg-subtle hover:bg-bg-base hover:text-brand"
                >
                  {t("lookup_action")}
                </a>
              </div>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="p-8 text-center text-sm text-fg-subtle">
              {tc("no_results")}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
