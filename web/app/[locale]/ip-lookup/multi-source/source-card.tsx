"use client";

import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink as ExternalIcon,
  XCircle,
} from "lucide-react";
import type { IpSourceEntry } from "@/lib/api";
import { SourceDetailGrid } from "./source-detail-grid";

/**
 * One provider's row: clickable header (status, name, latency, summary)
 * with an expandable detail body containing every field that provider
 * returned. The header stays compact so the user can scan many sources
 * vertically before diving into one.
 */
export function SourceCard({
  entry,
  isOpen,
  onToggle,
}: {
  entry: IpSourceEntry;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("ip");
  const tc = useTranslations("common");

  const summary = buildSummary(entry);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-bg-elevated"
        aria-expanded={isOpen}
      >
        {entry.ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-danger" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{entry.source}</span>
            <span className="text-xs tabular-nums text-fg-subtle">
              {entry.latencyMs}ms
            </span>
          </div>
          <div className="truncate text-xs text-fg-muted">
            {entry.ok ? summary : entry.error ?? tc("error_title")}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-border bg-bg-card/50 px-3 py-3">
          {entry.ok && entry.data ? (
            <SourceDetailGrid data={entry.data} />
          ) : (
            <div className="text-sm text-danger">
              {entry.error ?? tc("error_title")}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2">
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-brand"
            >
              {t("multi_open_raw")}
              <ExternalIcon className="h-3 w-3" />
            </a>
            <span className="text-xs text-fg-subtle">
              {tc("source")}: {new URL(entry.url).hostname}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One-line city · region · country · ASN summary from whatever fields
 * the provider happened to return. Sparse providers (just country) get
 * a sparse summary instead of empty separators.
 */
function buildSummary(entry: IpSourceEntry): string {
  if (!entry.ok || !entry.data) return "";
  const d = entry.data;
  const parts: string[] = [];
  if (d.city) parts.push(d.city);
  if (d.region) parts.push(d.region);
  if (d.country_name || d.country) {
    parts.push(String(d.country_name ?? d.country));
  }
  if (d.asn) parts.push(String(d.asn));
  return parts.join(" · ");
}
