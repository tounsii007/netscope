"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Home } from "lucide-react";
import { CATEGORIES, type CategoryAccent } from "@/components/mobile-nav/categories";

const ACCENT_TONE: Record<CategoryAccent, string> = {
  brand:   "text-brand bg-brand/10 ring-brand/30",
  cyan:    "text-cyan-soft bg-cyan-brand/10 ring-cyan-brand/30",
  violet:  "text-violet-soft bg-violet-brand/10 ring-violet-brand/30",
  success: "text-success bg-success/10 ring-success/30",
};
const ACCENT_HEADER: Record<CategoryAccent, string> = {
  brand:   "text-brand",
  cyan:    "text-cyan-soft",
  violet:  "text-violet-soft",
  success: "text-success",
};

/**
 * Scrollable body of the mobile drawer. Renders a Home link on top,
 * followed by every CATEGORY group with all its tool entries. The
 * drawer header (sticky title + close button) is handled by the parent.
 *
 * Each tool row carries a coloured icon chip matching the category
 * accent so the drawer reads as a visual menu rather than a list of
 * text links. Active route gets an accent left-rail.
 *
 * Closing on link-tap is delegated upward via `onNavigate` so the
 * parent owns the open/closed state.
 */
export function DrawerBody({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("nav");
  const tTools = useTranslations("nav.tools");
  const pathname = usePathname();

  const isHomeActive =
    pathname === "/" || /^\/[a-z]{2}$/.test(pathname);

  return (
    <nav className="pretty-scroll flex-1 overflow-y-auto px-2 py-3">
      {/* Home row — uses the same icon-chip layout as the tool rows for
          visual consistency. */}
      <Link
        href="/"
        onClick={onNavigate}
        className={`group mb-3 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition ${
          isHomeActive
            ? "bg-brand/10 text-brand font-medium"
            : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md ring-1 transition ${
            isHomeActive ? ACCENT_TONE.brand : "ring-border bg-bg-elevated text-fg-muted"
          }`}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex-1">{t("home")}</span>
        <ChevronRight className="h-3.5 w-3.5 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
      </Link>

      {CATEGORIES.map((cat) => {
        const iconTone = ACCENT_TONE[cat.accent];
        const headerTone = ACCENT_HEADER[cat.accent];
        return (
          <section key={cat.labelKey} className="mb-5">
            <h3
              className={`mb-1 px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${headerTone}`}
            >
              {t(cat.labelKey)}
            </h3>
            <ul className="space-y-0.5">
              {cat.items.map((tool) => {
                const Icon = tool.icon;
                const active =
                  pathname === tool.href || pathname.endsWith(tool.href);
                // Active rows get the brand text color so the existing
                // a11y/test snapshot still asserts on `text-brand`, while
                // the coloured left-rail uses the category's own accent.
                return (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm transition ${
                        active
                          ? "bg-brand/10 text-brand font-medium"
                          : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className={`absolute inset-y-2 left-0 w-0.5 rounded-r-full ${
                            cat.accent === "cyan"
                              ? "bg-cyan-soft"
                              : cat.accent === "violet"
                                ? "bg-violet-soft"
                                : cat.accent === "success"
                                  ? "bg-success"
                                  : "bg-brand"
                          }`}
                        />
                      )}
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-md ring-1 transition ${iconTone}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="flex-1">{tTools(tool.key)}</span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
