"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { CATEGORIES } from "@/components/mobile-nav/categories";

/**
 * Scrollable body of the mobile drawer. Renders a Home link on top,
 * followed by every CATEGORY group with all its tool entries. The
 * drawer header (sticky title + close button) is handled by the parent.
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
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      <Link
        href="/"
        onClick={onNavigate}
        className={`mb-2 flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition ${
          isHomeActive
            ? "bg-brand/10 text-brand font-medium"
            : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
        }`}
      >
        <span>{t("home")}</span>
        <ChevronRight className="h-4 w-4 opacity-50" />
      </Link>

      {CATEGORIES.map((cat) => (
        <section key={cat.labelKey} className="mb-4">
          <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            {t(cat.labelKey)}
          </h3>
          <ul className="space-y-0.5">
            {cat.items.map((tool) => {
              const active =
                pathname === tool.href || pathname.endsWith(tool.href);
              return (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    onClick={onNavigate}
                    className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
                    }`}
                  >
                    <span>{tTools(tool.key)}</span>
                    <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
