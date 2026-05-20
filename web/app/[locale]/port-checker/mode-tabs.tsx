"use client";

import { useTranslations } from "next-intl";

export type Mode = "single" | "common" | "range";

/**
 * Three-way segmented control for the port-checker mode (single / common
 * / range). Visual style mirrors a native iOS-style segmented control so
 * mobile users can switch with confidence. Active pill carries a soft
 * brand shadow so the selection reads cleanly on the dark background.
 */
export function ModeTabs({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const t = useTranslations("ports");
  const label = (m: Mode) =>
    m === "common" ? t("mode_common") : m === "range" ? t("mode_range") : t("mode_single");

  return (
    <div className="flex gap-1 rounded-xl border border-border bg-bg-elevated/70 p-1 backdrop-blur">
      {(["single", "common", "range"] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm capitalize transition ${
              active
                ? "bg-brand text-white shadow-glow-brand"
                : "text-fg-muted hover:bg-bg-card hover:text-fg"
            }`}
          >
            {label(m)}
          </button>
        );
      })}
    </div>
  );
}
