"use client";

import { useTranslations } from "next-intl";

export type Mode = "single" | "common" | "range";

/**
 * Three-way segmented control for the port-checker mode (single / common
 * / range). Visual style mirrors a native iOS-style segmented control so
 * mobile users can switch with confidence.
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
    <div className="flex gap-1 rounded-lg bg-bg-elevated p-1">
      {(["single", "common", "range"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm capitalize transition ${
            mode === m
              ? "bg-brand text-white"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          {label(m)}
        </button>
      ))}
    </div>
  );
}
