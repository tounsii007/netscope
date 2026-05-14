import Link from "next/link";
import { useTranslations } from "next-intl";
import { Network, Globe, Lock, Search, Activity, Server, Radar,
  Globe2, ShieldCheck, GitBranch, Cloud, KeyRound, Mail, ShieldAlert, ShieldX,
  ArrowRightLeft, Layers, Cookie, Image as ImageIcon, FileSearch,
  Wifi, Route, Unlock, ShieldEllipsis } from "lucide-react";

const toolKeys = [
  { href: "/port-checker",    icon: Network },
  { href: "/ip-lookup",       icon: Globe },
  { href: "/dns-lookup",      icon: Search },
  { href: "/dns-propagation", icon: Globe2 },
  { href: "/http-headers",    icon: ShieldCheck },
  { href: "/tech-stack",      icon: Layers },
  { href: "/redirects",       icon: ArrowRightLeft },
  { href: "/subdomains",      icon: GitBranch },
  { href: "/cdn-detector",    icon: Cloud },
  { href: "/ssl-check",       icon: Lock },
  { href: "/whois",           icon: Server },
  { href: "/reachability",    icon: Radar },
  { href: "/email-verify",    icon: Mail },
  { href: "/email-auth",      icon: ShieldAlert },
  { href: "/blacklist",       icon: ShieldX },
  { href: "/jwt",             icon: KeyRound },
  { href: "/password-leak",   icon: ShieldEllipsis },
  { href: "/dnssec",          icon: Lock },
  { href: "/cookies",         icon: Cookie },
  { href: "/opengraph",       icon: ImageIcon },
  { href: "/robots",          icon: FileSearch },
  { href: "/ipv6",            icon: Wifi },
  { href: "/bgp",             icon: Route },
  { href: "/mixed-content",   icon: Unlock },
  { href: "/dashboard",       icon: Activity },
] as const;

export default function Home() {
  const t = useTranslations("home");
  const tools = useTranslations("tools");

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-bg-card grid-bg">
        <div className="relative z-10 px-6 py-16 text-center md:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs text-fg-muted">
            <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-success" />
            {t("badge")}
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            {t("title_1")} <span className="text-brand">{t("title_2")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-fg-muted">{t("subtitle")}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/port-checker" className="btn glow">{t("cta_tools")}</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">{t("tools_heading")}</h2>
          <span className="text-sm text-fg-muted">{t("tools_count", { count: toolKeys.length })}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
          {toolKeys.map(({ href, icon: Icon }) => {
            const key = href.replace("/", "") as string;
            return (
              <Link key={href} href={href} className="group card hover:border-fg-muted transition">
                <Icon className="h-5 w-5 text-brand" />
                <h3 className="mt-3 font-medium">{tools(`${key}.title` as Parameters<typeof tools>[0])}</h3>
                <p className="mt-1 text-sm text-fg-muted">{tools(`${key}.desc` as Parameters<typeof tools>[0])}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
