import Link from "next/link";
import { Activity } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNav } from "./mobile-nav";

/**
 * Tool nav links — labels are i18n keys under `nav.tools.*`.
 * Order is curated for visual balance; do not sort alphabetically.
 * Exported for the mobile drawer to render the same set.
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

export async function SiteNav() {
  const t      = await getTranslations("nav");
  const tTools = await getTranslations("nav.tools");
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-white">
            <Activity className="h-4 w-4" />
          </span>
          NetScope
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {TOOL_LINKS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg"
              >
                {tTools(tool.key)}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/api-docs" className="hidden md:inline-flex btn-ghost text-xs">{t("api")}</Link>
          <Link href="/pricing"  className="hidden md:inline-flex btn       text-xs">{t("pricing")}</Link>
          <MobileNav toolLinks={TOOL_LINKS} />
        </div>
      </nav>
    </header>
  );
}
