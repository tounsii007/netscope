"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Keyboard, X } from "lucide-react";

/**
 * Cheat-sheet modal listing every global keyboard shortcut the app
 * exposes. Opens via `?` outside an input (vim convention) or by
 * focusing then pressing Enter on the help icon button in the
 * SiteNav.
 *
 * Pure presentation — owns only its open/close state. Triggered by
 * the global `?` key handler installed below, so a page that mounts
 * this once gets app-wide help availability without prop-drilling.
 *
 * Visual chrome mirrors the command palette (glass card, fade-up
 * animation, backdrop blur) so the two feel like siblings.
 */
export function KeyboardHelp() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // "?" opens — only when no input is focused, so it doesn't
      // hijack typing. Browser exposes Shift+/ as key="?" already.
      if (!open && e.key === "?") {
        const target = e.target as HTMLElement | null;
        const tag = (target?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        e.preventDefault();
        setOpen(true);
        return;
      }
      // Escape closes (in addition to the X button + backdrop click).
      if (open && e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label={t("search_close")}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-md animate-fade-in-up"
        style={{ animationDuration: "180ms" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kb-help-title"
        className="absolute left-1/2 top-[12vh] w-[92vw] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl animate-slide-up"
        style={{ animationDuration: "200ms" }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="kb-help-title" className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/25">
              <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {t("keyboard_shortcuts")}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("search_close")}
            className="rounded-md p-1 text-fg-subtle transition hover:bg-bg-elevated hover:text-fg"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ul className="divide-y divide-border/60">
          <Row keys={["⌘", "K"]} altKeys={["Ctrl", "K"]} label={t("shortcut_search")} />
          <Row keys={["/"]} label={t("shortcut_quick_search")} />
          <Row keys={["?"]} label={t("shortcut_help")} />
          <Row keys={["Esc"]} label={t("shortcut_close")} />
          <Row keys={["↑", "↓"]} label={t("shortcut_navigate")} />
          <Row keys={["⏎"]} label={t("shortcut_select")} />
        </ul>

        <p className="border-t border-border bg-bg-elevated/60 px-4 py-2.5 text-[11px] text-fg-subtle">
          {t("shortcut_footer")}
        </p>
      </div>
    </div>
  );
}

function Row({
  keys,
  altKeys,
  label,
}: {
  keys: string[];
  altKeys?: string[];
  label: string;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd key={k} className="kbd">{k}</kbd>
        ))}
        {altKeys && (
          <>
            <span className="px-1 text-[10px] uppercase tracking-wider text-fg-subtle">or</span>
            {altKeys.map((k) => (
              <kbd key={k} className="kbd">{k}</kbd>
            ))}
          </>
        )}
      </span>
    </li>
  );
}
