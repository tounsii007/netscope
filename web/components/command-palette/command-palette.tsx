"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Search, ArrowUp, ArrowDown, CornerDownLeft, X, Compass,
} from "lucide-react";
import { TOOL_LINKS } from "@/lib/tool-links";
import { routing } from "@/i18n/routing";

/**
 * Cmd-K / Ctrl-K command palette. A keyboard-driven quick-switcher for
 * the 25 tool routes. Opens via:
 *   • Cmd+K (mac) or Ctrl+K (win/linux) — from anywhere
 *   • "/" anywhere outside an input field — vim-style
 *   • Clicking the launcher button in the nav
 *
 * Closes on:
 *   • Escape
 *   • clicking outside the panel
 *   • selecting a result (Enter)
 *
 * Filtering is a simple case-insensitive substring against the tool
 * label and slug — fast, predictable, and works across all 11 locales
 * because we resolve the label through `nav.tools.*` for each link.
 *
 * Navigation uses next/router so locale prefixing works automatically.
 */
export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tTools = useTranslations("nav.tools");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Resolve current locale from the pathname so router.push() targets the
  // right /xx/ prefix.
  const currentLocale = useMemo(() => {
    const seg = pathname.split("/")[1] ?? "";
    return (routing.locales as readonly string[]).includes(seg)
      ? seg
      : routing.defaultLocale;
  }, [pathname]);

  // Build the searchable list. Each entry keeps the localised label,
  // raw key (so users typing "ipv" still hit ipv6), and the route.
  const items = useMemo(() => {
    return TOOL_LINKS.map((l) => ({
      href: l.href,
      key:  l.key,
      label: tTools(l.key as Parameters<typeof tTools>[0]),
    }));
  }, [tTools]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.href.toLowerCase().includes(q) ||
        i.key.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Derive a clamped active index during render so a shrinking result
  // set can't leave us pointing past the end. Keeps `setActive` as the
  // sole writer for keyboard nav while removing the cascading-render
  // effect that used to do this fix-up.
  const safeActive =
    filtered.length === 0 ? 0 : Math.min(active, filtered.length - 1);

  // Scroll active row into view as the user arrows through results.
  // jsdom doesn't implement scrollIntoView, so we feature-check before
  // calling — keeps the test env from throwing while still smoothly
  // scrolling in real browsers.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.querySelector(
      `[data-cmd-index="${safeActive}"]`,
    ) as HTMLElement | null;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [safeActive, open, filtered.length]);

  // Focus the search input when opened.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Global shortcut listener. Lifted to its own effect so it doesn't
  // rebind every keystroke inside the palette.
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // "/" toggle — only when no input is focused, so it doesn't hijack
      // typing inside a form.
      if (!open && e.key === "/") {
        const t = e.target as HTMLElement | null;
        const tag = (t?.tagName ?? "").toLowerCase();
        if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function go(href: string) {
    const target =
      currentLocale === routing.defaultLocale ? href : `/${currentLocale}${href}`;
    close();
    router.push(target);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(filtered.length - 1, safeActive + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, safeActive - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[safeActive];
      if (item) go(item.href);
    }
  }

  return (
    <>
      {/* Launcher button — desktop only; mobile has the hamburger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open_search")}
        className="hidden lg:inline-flex items-center gap-2 rounded-lg border border-border bg-bg-elevated/70 px-2.5 py-1.5 text-xs text-fg-muted transition hover:border-brand/40 hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t("search_tools")}</span>
        <span className="ml-1 inline-flex items-center gap-0.5">
          <kbd className="kbd">⌘</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-md animate-fade-in-up"
            style={{ animationDuration: "180ms" }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("search_tools")}
            className="absolute left-1/2 top-[10vh] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl animate-slide-up"
            style={{ animationDuration: "200ms" }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onInputKey}
                placeholder={t("search_placeholder")}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1 text-fg-subtle transition hover:bg-bg-elevated hover:text-fg"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Results list */}
            <ul
              ref={listRef}
              role="listbox"
              aria-label={t("search_tools")}
              className="pretty-scroll max-h-[60vh] overflow-y-auto p-1.5"
            >
              {filtered.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-fg-muted">
                  <Compass className="mx-auto mb-2 h-6 w-6 text-fg-subtle" aria-hidden="true" />
                  {t("search_empty")}
                </li>
              ) : (
                filtered.map((item, i) => {
                  const isActive = i === safeActive;
                  return (
                    <li key={item.href} role="option" aria-selected={isActive}>
                      <button
                        type="button"
                        data-cmd-index={i}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(item.href)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "bg-brand/10 text-fg ring-1 ring-brand/30"
                            : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Search
                            className={`h-3.5 w-3.5 shrink-0 ${
                              isActive ? "text-brand" : "text-fg-subtle"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate font-medium">{item.label}</span>
                          <span className="truncate font-mono text-[11px] text-fg-subtle">
                            {item.href}
                          </span>
                        </span>
                        {isActive && (
                          <CornerDownLeft
                            className="h-3.5 w-3.5 shrink-0 text-brand"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-border bg-bg-elevated/60 px-4 py-2 text-[11px] text-fg-subtle">
              <span className="inline-flex items-center gap-1.5">
                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                {t("search_navigate")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                {t("search_open")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <kbd className="kbd">Esc</kbd>
                {t("search_close")}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
