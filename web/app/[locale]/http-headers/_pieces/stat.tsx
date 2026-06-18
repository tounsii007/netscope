/**
 * Tiny key/value chip used inside HSTS + CSP audit grids.
 *
 * `ok` controls the colour:
 *   • `true`  → success-tone (green checkmark)
 *   • `false` → warn-tone (amber alert)
 *   • `undefined` → neutral (no icon, default text tone)
 *
 * Lives under _pieces/ because both HstsPanel and CspAudit need it
 * and lifting it to /components would scatter a single-page concern
 * into the shared component pile.
 */

import { CheckCircle2, AlertCircle } from "lucide-react";

export function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  const tone =
    ok === true
      ? "bg-success/10 ring-success/25 text-success"
      : ok === false
        ? "bg-warn/10 ring-warn/25 text-warn"
        : "bg-bg-elevated ring-border text-fg";
  const icon =
    ok === true ? (
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
    ) : ok === false ? (
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
    ) : null;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg ring-1 px-3 py-2 ${tone}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </span>
      <span className="inline-flex items-center gap-1 font-mono text-sm">
        {icon}
        {value}
      </span>
    </div>
  );
}

/**
 * Render an HSTS max-age in human-readable form alongside the raw
 * seconds count: "31536000 (1 year)".
 */
export function formatMaxAge(seconds: number): string {
  const human =
    seconds >= 31_536_000 ? `${Math.round(seconds / 31_536_000)} year${seconds >= 63_072_000 ? "s" : ""}` :
    seconds >= 86_400      ? `${Math.round(seconds / 86_400)} day${seconds >= 172_800 ? "s" : ""}` :
    seconds >= 3_600       ? `${Math.round(seconds / 3_600)} h` :
    `${seconds} s`;
  return `${seconds} (${human})`;
}
