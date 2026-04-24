import Link from "next/link";
import { Activity } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "./language-switcher";

const toolLinks = [
  { href: "/port-checker", label: "Ports" },
  { href: "/ip-lookup", label: "IP" },
  { href: "/dns-lookup", label: "DNS" },
  { href: "/dns-propagation", label: "Propagation" },
  { href: "/http-headers", label: "Headers" },
  { href: "/tech-stack", label: "Tech" },
  { href: "/redirects", label: "Redirects" },
  { href: "/subdomains", label: "Subs" },
  { href: "/cdn-detector", label: "CDN" },
  { href: "/ssl-check", label: "SSL" },
  { href: "/whois", label: "WHOIS" },
  { href: "/email-verify", label: "Email" },
  { href: "/email-auth", label: "SPF/DMARC" },
  { href: "/blacklist", label: "DNSBL" },
  { href: "/dnssec", label: "DNSSEC" },
  { href: "/ipv6", label: "IPv6" },
  { href: "/bgp", label: "BGP" },
  { href: "/opengraph", label: "OG" },
  { href: "/cookies", label: "Cookies" },
  { href: "/robots", label: "Robots" },
  { href: "/mixed-content", label: "Mixed" },
  { href: "/jwt", label: "JWT" },
  { href: "/password-leak", label: "Pwd" },
];

export async function SiteNav() {
  const t = await getTranslations("nav");
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
          {toolLinks.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-elevated hover:text-fg">
                {tool.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/api-docs" className="btn-ghost text-xs">{t("api")}</Link>
          <Link href="/pricing" className="btn text-xs">{t("pricing")}</Link>
        </div>
      </nav>
    </header>
  );
}
