"use client";

import { useTranslations } from "next-intl";
import type { DnsRecordDetail } from "@/lib/api";

/**
 * Render a single DNS record-type panel with all the metadata the
 * backend ships in `recordsDetailed[type]`. Falls back gracefully:
 * if a type doesn't have its specialised fields populated (e.g. no
 * MX preference because the type happens to be A), we just render
 * the value + TTL line.
 *
 * Per-type richer rendering:
 *
 *   • MX  → priority chip + exchange host on its own row
 *   • SOA → split the seven SOA fields into a two-column grid; each
 *           timing field carries a humanised "(15m)" suffix
 *   • CAA → render flags/tag/value as a structured triple
 *   • All → TTL chip with a humanised seconds → "(5m)" hint
 *
 * Accent: cyan to match the DNS category tint from the landing grid.
 */
export function DetailedRecordList({
  type,
  entries,
}: {
  type: string;
  entries: DnsRecordDetail[];
}) {
  const t = useTranslations("dns");

  if (type === "MX") {
    const sorted = [...entries].sort(
      (a, b) => (a.preference ?? 0) - (b.preference ?? 0)
    );
    return (
      <ul className="space-y-2 font-mono text-sm">
        {sorted.map((e, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-lg border border-border/50 bg-bg-elevated px-3 py-2"
          >
            <span className="inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md bg-cyan-brand/15 px-2 text-xs font-bold text-cyan-soft ring-1 ring-cyan-brand/25">
              {e.preference ?? "?"}
            </span>
            <span className="flex-1 break-all text-fg">{e.exchange ?? e.value}</span>
            <TtlChip ttl={e.ttl} />
          </li>
        ))}
      </ul>
    );
  }

  if (type === "SOA") {
    return (
      <ul className="space-y-2 text-sm">
        {entries.map((e, i) => (
          <li key={i} className="rounded-lg border border-border/50 bg-bg-elevated p-3">
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              <SoaRow label={t("soa_primary_ns")} value={e.primaryNs} mono />
              <SoaRow label={t("soa_admin")}      value={e.adminEmail} mono />
              <SoaRow label={t("soa_serial")}     value={e.serial?.toString()} mono />
              <SoaRow label={t("soa_refresh")}    value={humanSeconds(e.refresh)} />
              <SoaRow label={t("soa_retry")}      value={humanSeconds(e.retry)} />
              <SoaRow label={t("soa_expire")}     value={humanSeconds(e.expire)} />
              <SoaRow label={t("soa_minimum")}    value={humanSeconds(e.minimum)} />
              <SoaRow label={t("soa_ttl")}        value={humanSeconds(e.ttl)} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (type === "CAA") {
    return (
      <ul className="space-y-2 font-mono text-sm">
        {entries.map((e, i) => (
          <li key={i} className="rounded-lg border border-border/50 bg-bg-elevated px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-cyan-brand/15 px-2 py-0.5 text-xs font-bold text-cyan-soft ring-1 ring-cyan-brand/25">
                {e.tag ?? "tag?"}
              </span>
              <span className="text-xs text-fg-muted">flags={e.flags ?? 0}</span>
              <TtlChip ttl={e.ttl} />
            </div>
            <div className="mt-1 break-all text-fg">{e.caaValue ?? e.value}</div>
          </li>
        ))}
      </ul>
    );
  }

  // Default — A, AAAA, NS, TXT, CNAME
  return (
    <ul className="space-y-1 font-mono text-sm">
      {entries.map((e, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-lg border border-border/50 bg-bg-elevated px-3 py-1.5"
        >
          <span className="flex-1 break-all text-fg">{e.value}</span>
          <TtlChip ttl={e.ttl} />
        </li>
      ))}
    </ul>
  );
}

function TtlChip({ ttl }: { ttl: number }) {
  const human = humanSeconds(ttl);
  return (
    <span
      className="shrink-0 rounded-md border border-border bg-bg-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted"
      title={`${ttl}s${human ? ` (${human})` : ""}`}
    >
      TTL {human ?? `${ttl}s`}
    </span>
  );
}

function SoaRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</span>
      <span className={`break-all ${mono ? "font-mono text-fg" : "text-fg"}`}>{value}</span>
    </div>
  );
}

/**
 * Convert a seconds count into a compact human label: 7200 → "2h",
 * 86 400 → "1d", 60 → "1m". Returns null for sub-minute durations so
 * the caller can fall back to "{n}s".
 */
function humanSeconds(s: number | undefined): string | null {
  if (s == null) return null;
  if (s < 60) return null;
  if (s < 3_600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}
