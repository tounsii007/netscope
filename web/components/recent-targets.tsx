"use client";

import { History, X } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Compact horizontal strip of "recent target" chips rendered
 * immediately below a tool's input row. Each chip pre-fills the input
 * on click, an `x` next to it removes that entry from history.
 *
 * Renders nothing when the history is empty — keeps first-time users
 * from seeing dead UI.
 *
 * Pure presentational. The recent list + mutators come from
 * `useRecentTargets`, owned by the tool's client.
 *
 * Optional `currentValue` triggers a subtle "Pick a recent" highlight
 * when the user has cleared the input — gives them a nudge instead
 * of a silent set of chips. Pass nothing to opt out.
 */
export function RecentTargets({
  recent,
  onPick,
  onForget,
  currentValue,
  className = "",
}: {
  recent: string[];
  onPick: (value: string) => void;
  onForget: (value: string) => void;
  /** When provided and equal to "", the eyebrow shows a gentle "pick one" hint. */
  currentValue?: string;
  className?: string;
}) {
  const t = useTranslations("common");

  if (recent.length === 0) return null;

  // Treat undefined / whitespace as "no input" so the hint nudges
  // when the user cleared the field, not on first paint of an
  // uncontrolled wrapper that hasn't passed currentValue.
  const inputIsEmpty =
    currentValue !== undefined && currentValue.trim().length === 0;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}
      aria-label={t("recent_targets")}
    >
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition ${
          inputIsEmpty ? "text-brand" : "text-fg-subtle"
        }`}
      >
        <History className="h-3 w-3" aria-hidden="true" />
        {inputIsEmpty ? t("recent_pick_one") : t("recent")}
      </span>
      {recent.map((value) => (
        <span
          key={value}
          className="group inline-flex items-center gap-1 rounded-md border border-border bg-bg-elevated/80 pl-2 pr-1 py-1 font-mono text-[11px] text-fg-muted transition hover:border-brand/40 hover:text-fg"
        >
          <button
            type="button"
            onClick={() => onPick(value)}
            className="max-w-[12rem] truncate"
            title={value}
          >
            {value}
          </button>
          <button
            type="button"
            onClick={() => onForget(value)}
            aria-label={t("recent_forget", { value })}
            className="rounded p-0.5 text-fg-subtle opacity-60 transition hover:bg-bg-card hover:text-fg-muted hover:opacity-100"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
