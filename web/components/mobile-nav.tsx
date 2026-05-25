"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { DrawerBody } from "@/components/mobile-nav/drawer-body";

/**
 * Module-level reference counter for body scroll locking.
 *
 * If two MobileNav instances are mounted in parallel (e.g. one in the
 * header and one elsewhere on the same page) and both open at once,
 * naive "save & restore prevOverflow" would corrupt the body style as
 * each instance restores the value the OTHER one had captured.
 * Reference counting decouples the two: body stays locked while ANY
 * drawer is open, unlocks only when the LAST one closes.
 */
let openDrawerCount = 0;

/**
 * Slide-out drawer for tool navigation on screens narrower than `lg`
 * (1024 px). Owns only the open/close state and the side-effects that
 * accompany it (route-change auto-close, Escape, body-scroll lock);
 * the actual category list lives in {@link DrawerBody} and the static
 * tool catalog in {@link CATEGORIES} so adding a new tool is a one-line
 * change.
 *
 * The trigger and panel both pick up the modernised dark-glass styling
 * — translucent surface, subtle border highlight, and a small brand
 * accent on the trigger hover.
 *
 * The `toolLinks` prop is kept for API compatibility with the parent
 * SiteNav, but is no longer consumed — categories are derived
 * internally so a future reshuffle in SiteNav can't desync the drawer.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MobileNav(_props: { toolLinks: { href: string; key: string }[] }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close drawer on route change so the user is never stranded behind
  // a blocking modal after tapping a link.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes; body scroll-locks while ANY drawer is open. We use a
  // module-level refcount so two parallel drawers can't fight over the
  // body.style.overflow value (see openDrawerCount above).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    openDrawerCount += 1;
    if (openDrawerCount === 1) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      openDrawerCount = Math.max(0, openDrawerCount - 1);
      if (openDrawerCount === 0) {
        document.body.style.overflow = "";
      }
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
        className="lg:hidden flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated/70 text-fg-muted backdrop-blur transition hover:border-brand/40 hover:bg-bg-card hover:text-fg"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="lg:hidden">
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md animate-fade-in-up"
            style={{ animationDuration: "200ms" }}
          />

          <aside
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t("tools_menu")}
            className="fixed right-0 top-0 z-50 flex h-full w-[88vw] max-w-sm flex-col border-l border-border bg-bg-card shadow-2xl animate-slide-up"
            style={{ animationDuration: "240ms" }}
          >
            {/* Sticky drawer header — gets its own translucent surface
                so the body content can scroll underneath without
                visually fighting the title. */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-card/95 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="h-6 w-1 rounded-full bg-gradient-to-b from-brand via-violet-brand to-cyan-brand" aria-hidden="true" />
                <span className="font-semibold text-fg">{t("tools_menu")}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close_menu")}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-fg-muted transition hover:border-border hover:bg-bg-elevated hover:text-fg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <DrawerBody onNavigate={() => setOpen(false)} />

            {/* Soft mesh wash at the bottom — gives the drawer a hint
                of life without distracting from the link list. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-mesh-2 opacity-25"
            />
          </aside>
        </div>
      )}
    </>
  );
}
