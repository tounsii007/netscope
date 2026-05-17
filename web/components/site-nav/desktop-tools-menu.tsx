import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TOOL_GROUPS } from "@/components/site-nav/tool-groups";

/**
 * Desktop-only categorised tools menu. Five hover-/focus-revealed
 * dropdowns instead of 23 flat items, so the bar stays scannable even
 * on 1280 px screens. Hidden below `lg:` — the mobile drawer takes over
 * there.
 */
export async function DesktopToolsMenu() {
  const t = await getTranslations("nav");
  const tTools = await getTranslations("nav.tools");

  return (
    <ul className="hidden lg:flex items-center gap-1 ml-2" aria-label={t("tools_menu")}>
      {TOOL_GROUPS.map((group) => {
        // Stable id pairs the trigger button with its dropdown panel
        // for aria-controls. Composed from the group key so it matches
        // server- and client-rendered HTML byte-for-byte (useId would
        // mismatch on RSC re-render).
        const panelId = `tools-menu-${group.labelKey}`;
        return (
          <li key={group.labelKey} className="relative group">
            {/*
              Pure CSS-only disclosure: hover OR keyboard focus on the
              trigger sets `group-hover` / `group-focus-within` on the
              <li>, which flips the panel from `invisible/opacity-0` to
              `visible/opacity-100`. Once visible, panel children are
              tabbable in normal document order.

              We deliberately do NOT advertise aria-haspopup or set an
              aria-expanded state because both attributes imply
              programmatic control (click toggles open/closed) which we
              don't have. Misleading ARIA is worse than missing ARIA —
              AT users hear "collapsed menu" and try Enter to expand,
              which here does nothing. The visible chevron + the
              tabbable children give sighted and keyboard users a
              consistent affordance without lying to AT.
            */}
            <button
              type="button"
              aria-controls={panelId}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg transition focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              {t(group.labelKey)}
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
            </button>
            <div
              id={panelId}
              className="invisible absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-bg-card shadow-xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            >
              <ul className="py-1.5" aria-label={t(group.labelKey)}>
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block px-3.5 py-2 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg transition"
                    >
                      {tTools(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
