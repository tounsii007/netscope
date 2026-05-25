import { getTranslations } from "next-intl/server";
import {
  Network, Globe, Lock, Search, Server, Radar,
  Globe2, ShieldCheck, GitBranch, Cloud, KeyRound, Mail, ShieldAlert, ShieldX,
  ArrowRightLeft, Layers, Cookie, Image as ImageIcon, FileSearch,
  Wifi, Route, Unlock, ShieldEllipsis,
} from "lucide-react";

import { HomeHero } from "@/components/home/hero";
import { CategorySection, type CategoryTool } from "@/components/home/category-section";
import { FeaturesStrip } from "@/components/home/features-strip";
import { CtaBanner } from "@/components/home/cta-banner";

/**
 * Landing-page route. Composes the hero + five categorised tool
 * sections + features strip + bottom CTA. All copy reads from the
 * `home.*` and `tools.<slug>.*` i18n namespaces so adding a locale
 * never requires touching this file.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  const tt = await getTranslations({ locale, namespace: "tools" });

  // Tool entry helper — pulls localised title + desc by slug.
  const tool = (slug: string, icon: CategoryTool["icon"]): CategoryTool => ({
    href: `/${slug}`,
    title: tt(`${slug}.title` as Parameters<typeof tt>[0]),
    desc: tt(`${slug}.desc` as Parameters<typeof tt>[0]),
    icon,
  });

  const dnsTools = [
    tool("dns-lookup", Search),
    tool("dns-propagation", Globe2),
    tool("dnssec", Lock),
    tool("whois", Server),
    tool("subdomains", GitBranch),
  ];
  const networkTools = [
    tool("port-checker", Network),
    tool("ip-lookup", Globe),
    tool("ipv6", Wifi),
    tool("bgp", Route),
    tool("cdn-detector", Cloud),
    tool("reachability", Radar),
  ];
  const securityTools = [
    tool("ssl-check", Lock),
    tool("blacklist", ShieldX),
    tool("jwt", KeyRound),
    tool("password-leak", ShieldEllipsis),
    tool("mixed-content", Unlock),
  ];
  const emailTools = [
    tool("email-verify", Mail),
    tool("email-auth", ShieldAlert),
  ];
  const webTools = [
    tool("http-headers", ShieldCheck),
    tool("tech-stack", Layers),
    tool("redirects", ArrowRightLeft),
    tool("opengraph", ImageIcon),
    tool("cookies", Cookie),
    tool("robots", FileSearch),
  ];

  return (
    <div className="space-y-16 sm:space-y-20">
      <HomeHero />

      <div className="space-y-12 sm:space-y-14">
        <header className="text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("tools_heading")}
          </h2>
          <p className="mt-2 text-sm text-fg-muted sm:text-base">
            {t("tools_count", {
              count: dnsTools.length + networkTools.length + securityTools.length
                + emailTools.length + webTools.length,
            })}
          </p>
        </header>

        <CategorySection
          title={t("cat_dns_title")}
          caption={t("cat_dns_caption")}
          accent="cyan"
          tools={dnsTools}
          icon={Search}
        />
        <CategorySection
          title={t("cat_network_title")}
          caption={t("cat_network_caption")}
          accent="brand"
          tools={networkTools}
          icon={Network}
        />
        <CategorySection
          title={t("cat_security_title")}
          caption={t("cat_security_caption")}
          accent="violet"
          tools={securityTools}
          icon={ShieldCheck}
        />
        <CategorySection
          title={t("cat_email_title")}
          caption={t("cat_email_caption")}
          accent="success"
          tools={emailTools}
          icon={Mail}
        />
        <CategorySection
          title={t("cat_web_title")}
          caption={t("cat_web_caption")}
          accent="cyan"
          tools={webTools}
          icon={Globe}
        />
      </div>

      <FeaturesStrip />
      <CtaBanner />
    </div>
  );
}
