import Link from "next/link";
import { Activity, ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";

/**
 * Tool nav links — flat list used by:
 *   • the mobile drawer (one big list, easy to scroll)
 *   • the home-page tool grid (alphabetic-ish curation)
 * Each entry's `key` resolves under `nav.tools.*` in the locale bundles.
 */
export const TOOL_LINKS: { href: string; key: string }[] = [
  { href: "/port-checker",   key: "ports"       },
  { href: "/ip-lookup",      key: "ip"          },
  { href: "/dns-lookup",     key: "dns"         },
  { href: "/dns-propagation",key: "propagation" },
  { href: "/http-headers",   key: "headers"     },
  { href: "/tech-stack",     key: "tech"        },
  { href: "/redirects",      key: "redirects"   },
  { href: "/subdomains",     key: "subs"        },
  { href: "/cdn-detector",   key: "cdn"         },
  { href: "/ssl-check",      key: "ssl"         },
  { href: "/whois",          key: "whois"       },
  { href: "/email-verify",   key: "email"       },
  { href: "/email-auth",     key: "email_auth"  },
  { href: "/blacklist",      key: "blacklist"   },
  { href: "/dnssec",         key: "dnssec"      },
  { href: "/ipv6",           key: "ipv6"        },
  { href: "/bgp",            key: "bgp"         },
  { href: "/opengraph",      key: "og"          },
  { href: "/cookies",        key: "cookies"     },
  { href: "/robots",         key: "robots"      },
  { href: "/mixed-content",  key: "mixed"       },
  { href: "/jwt",            key: "jwt"         },
  { href: "/password-leak",  key: "pwd"         },
];

/**
 * Categorised view used by the desktop nav. Five buckets keep the bar to
 * five buttons + ChevronDown each — fits nicely on a 1280px screen.
 */
const TOOL_GROUPS: { labelKey: "cat_dns" | "cat_network" | "cat_security" | "cat_email" | "cat_web";
                    items: { href: string; key: string }[] }[] = [
  { labelKey: "cat_dns", items: [
    { href: "/dns-lookup",      key: "dns"         },
    { href: "/dns-propagation", key: "propagation" },
    { href: "/dnssec",          key: "dnssec"      },
    { href: "/whois",           key: "whois"       },
    { href: "/subdomains",      key: "subs"        },
  ]},
  { labelKey: "cat_network", items: [
    { href: "/port-checker",    key: "ports"      },
    { href: "/ip-lookup",       key: "ip"         },
    { href: "/ipv6",            key: "ipv6"       },
    { href: "/bgp",             key: "bgp"        },
    { href: "/cdn-detector",    key: "cdn"        },
  ]},
  { labelKey: "cat_security", items: [
    { href: "/ssl-check",       key: "ssl"       },
    { href: "/blacklist",       key: "blacklist" },
    { href: "/jwt",             key: "jwt"       },
    { href: "/password-leak",   key: "pwd"       },
    { href: "/mixed-content",   key: "mixed"     },
  ]},
  { labelKey: "cat_email", items: [
    { href: "/email-verify",    key: "email"      },
    { href: "/email-auth",      key: "email_auth" },
  ]},
  { labelKey: "cat_web", items: [
    { href: "/http-headers",    key: "headers"  },
    { href: "/tech-stack",      key: "tech"     },
    { href: "/redirects",       key: "redirects"},
    { href: "/opengraph",       key: "og"       },
    { href: "/cookies",         key: "cookies"  },
    { href: "/robots",          key: "robots"   },
  ]},
];

export async function SiteNav() {
  const t      = await getTranslations("nav");
  const tTools = await getTranslations("nav.tools");
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold shrink-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-white">
            <Activity className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">NetScope</span>
        </Link>

        {/* Desktop: 5 grouped dropdowns instead of 23 flat items */}
        <ul className="hidden lg:flex items-center gap-1 ml-2">
          {TOOL_GROUPS.map((group) => (
            <li key={group.labelKey} className="relative group">
              <button
                type="button"
                className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg transition focus:outline-none focus:ring-2 focus:ring-brand/30"
                aria-haspopup="true"
              >
                {t(group.labelKey)}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
              <div
                role="menu"
                className="invisible absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-bg-card shadow-xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
              >
                <ul className="py-1.5">
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
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/api-docs" className="hidden lg:inline-flex btn-ghost text-xs">{t("api")}</Link>
          <Link href="/pricing"  className="hidden lg:inline-flex btn       text-xs">{t("pricing")}</Link>
          <MobileNav toolLinks={TOOL_LINKS} />
        </div>
      </nav>
    </header>
  );
}
