/**
 * Categorised view used by the desktop nav. Five buckets keep the bar
 * to five buttons + ChevronDown each — fits nicely on a 1280 px screen
 * without overflow. Mobile uses an identical grouping (see
 * `components/mobile-nav/categories.ts`) so the two stay aligned.
 */
export type CategoryLabel =
  | "cat_dns"
  | "cat_network"
  | "cat_security"
  | "cat_email"
  | "cat_web";

export interface ToolGroup {
  labelKey: CategoryLabel;
  items: { href: string; key: string }[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  {
    labelKey: "cat_dns",
    items: [
      { href: "/dns-lookup",      key: "dns" },
      { href: "/dns-propagation", key: "propagation" },
      { href: "/dnssec",          key: "dnssec" },
      { href: "/whois",           key: "whois" },
      { href: "/subdomains",      key: "subs" },
    ],
  },
  {
    labelKey: "cat_network",
    items: [
      { href: "/port-checker",    key: "ports" },
      { href: "/ip-lookup",       key: "ip" },
      { href: "/ipv6",            key: "ipv6" },
      { href: "/bgp",             key: "bgp" },
      { href: "/cdn-detector",    key: "cdn" },
    ],
  },
  {
    labelKey: "cat_security",
    items: [
      { href: "/ssl-check",       key: "ssl" },
      { href: "/blacklist",       key: "blacklist" },
      { href: "/jwt",             key: "jwt" },
      { href: "/password-leak",   key: "pwd" },
      { href: "/mixed-content",   key: "mixed" },
    ],
  },
  {
    labelKey: "cat_email",
    items: [
      { href: "/email-verify",    key: "email" },
      { href: "/email-auth",      key: "email_auth" },
    ],
  },
  {
    labelKey: "cat_web",
    items: [
      { href: "/http-headers",    key: "headers" },
      { href: "/tech-stack",      key: "tech" },
      { href: "/redirects",       key: "redirects" },
      { href: "/opengraph",       key: "og" },
      { href: "/cookies",         key: "cookies" },
      { href: "/robots",          key: "robots" },
    ],
  },
];
