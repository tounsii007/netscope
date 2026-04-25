"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";

/**
 * Slide-out drawer with all 23 tool links. Visible on <md breakpoints,
 * complements the horizontal desktop nav in <SiteNav>.
 *
 * • Closes on route change (pathname effect)
 * • Closes on Escape key
 * • Locks body scroll while open
 * • Backdrop click closes
 */
export function MobileNav({
  toolLinks,
}: {
  toolLinks: { href: string; key: string }[];
}) {
  const t      = useTranslations("nav");
  const tTools = useTranslations("nav.tools");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Escape to close + body scroll lock
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open_menu")}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        className="md:hidden flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-bg-elevated hover:text-fg transition"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in-up"
            style={{ animationDuration: "200ms" }}
          />

          {/* Drawer */}
          <aside
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("tools_menu")}
            className="fixed right-0 top-0 z-50 h-full w-[85vw] max-w-sm overflow-y-auto border-l border-border bg-bg-card shadow-2xl md:hidden"
            style={{ animation: "slideInRight 250ms ease-out" }}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-bg-card/95 px-4 py-3 backdrop-blur">
              <span className="font-semibold">{t("tools_menu")}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close_menu")}
                className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-bg-elevated hover:text-fg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="p-2">
              <ul className="space-y-0.5">
                {toolLinks.map((tool) => {
                  const active =
                    pathname === tool.href ||
                    pathname.endsWith(tool.href) ||
                    pathname.includes(`${tool.href}/`);
                  return (
                    <li key={tool.href}>
                      <Link
                        href={tool.href}
                        className={`block rounded-md px-3 py-2.5 text-sm transition ${
                          active
                            ? "bg-brand/10 text-brand font-medium"
                            : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
                        }`}
                      >
                        {tTools(tool.key)}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 border-t border-border pt-4 px-1 space-y-2">
                <Link href="/api-docs" className="btn-ghost w-full justify-center text-sm">
                  {t("api")}
                </Link>
                <Link href="/pricing" className="btn w-full justify-center text-sm">
                  {t("pricing")}
                </Link>
              </div>
            </nav>
          </aside>

          <style jsx>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); }
              to   { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}
