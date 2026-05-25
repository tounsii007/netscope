import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TOOL_GROUPS, type CategoryAccent } from "@/components/site-nav/tool-groups";

const ACCENT_ICON: Record<CategoryAccent, string> = {
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
 * Desktop-only categorised tools menu. Five hover-/focus-revealed
 * dropdowns instead of 23 flat items, so the bar stays scannable even
 * on 1280 px screens. Hidden below `lg:` — the mobile drawer takes over
 * there.
 *
 * Each panel now renders icon + label rows so users can spot a tool
 * by shape and colour, not just by reading. The panel itself is
 * wider (260px), uses a glass surface, and has a coloured top edge
 * matching the category accent.
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
        const iconTone = ACCENT_ICON[group.accent];
        const headerTone = ACCENT_HEADER[group.accent];
        const barTone =
          group.accent === "cyan"
            ? "from-cyan-brand via-cyan-soft to-transparent"
            : group.accent === "violet"
              ? "from-violet-brand via-violet-soft to-transparent"
              : group.accent === "success"
                ? "from-success via-success/60 to-transparent"
                : "from-brand via-brand-soft to-transparent";

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
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg transition focus:outline-none focus:ring-2 focus:ring-brand/30 group-hover:text-fg group-focus-within:text-fg"
            >
              {t(group.labelKey)}
              <ChevronDown
                aria-hidden="true"
                className="h-3.5 w-3.5 opacity-60 transition group-hover:rotate-180 group-focus-within:rotate-180"
              />
            </button>
            <div
              id={panelId}
              className="invisible absolute left-0 top-full z-50 mt-2 min-w-[280px] origin-top -translate-y-1 rounded-xl border border-border bg-bg-card/95 p-1.5 opacity-0 shadow-2xl backdrop-blur-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
            >
              {/* Accent bar — coloured top stripe so each category
                  feels distinct without yelling. */}
              <div
                aria-hidden="true"
                className={`mx-2 mb-1.5 mt-0.5 h-px bg-gradient-to-r ${barTone}`}
              />
              <p className={`px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${headerTone}`}>
                {t(group.labelKey)}
              </p>
              <ul className="space-y-0.5" aria-label={t(group.labelKey)}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-muted transition hover:bg-bg-elevated hover:text-fg"
                      >
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 transition group-hover:scale-105 ${iconTone}`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="flex-1">{tTools(item.key)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
