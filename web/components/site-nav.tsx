import { LanguageSwitcher } from "@/components/language-switcher";
import { MobileNav } from "@/components/mobile-nav";
import { BrandLink } from "@/components/site-nav/brand-link";
import { DesktopToolsMenu } from "@/components/site-nav/desktop-tools-menu";
import { TOOL_LINKS } from "@/lib/tool-links";

/**
 * Top-level site navigation: brand on the left, categorised tool
 * dropdowns in the centre (desktop only), language switcher and
 * hamburger trigger on the right.
 *
 * Composed of focused pieces:
 *   • BrandLink         — logo + product name (components/site-nav)
 *   • DesktopToolsMenu  — five-bucket category dropdown (components/site-nav)
 *   • LanguageSwitcher  — flag dropdown (components)
 *   • MobileNav         — slide-out drawer (components)
 *
 * The flat tool list lives in {@link "@/lib/tool-links"} so home grid,
 * 404 fuzzy-match and the mobile drawer all share one source of truth.
 */
export { TOOL_LINKS } from "@/lib/tool-links"; // re-export for legacy callers

export async function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl 2xl:max-w-7xl items-center gap-2 sm:gap-4 px-3 sm:px-4 md:px-6 py-3">
        <BrandLink />
        <DesktopToolsMenu />
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <MobileNav toolLinks={TOOL_LINKS} />
        </div>
      </nav>
    </header>
  );
}
