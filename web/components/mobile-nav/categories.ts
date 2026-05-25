import {
  Network, Globe, Lock, Search, Server, GitBranch, Cloud, KeyRound,
  Mail, ShieldAlert, ShieldX, ArrowRightLeft, Layers, Cookie,
  Image as ImageIcon, FileSearch, Wifi, Route, Unlock, ShieldEllipsis,
  Globe2, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * Tool categories shown in the mobile drawer. Mirrors the desktop nav
 * grouping so users see the same mental model whatever device they're
 * on. Each entry now carries its icon + an accent colour for the
 * section header, matching the desktop dropdown panels.
 */
export type CategoryLabel =
  | "cat_dns"
  | "cat_network"
  | "cat_security"
  | "cat_email"
  | "cat_web";

export type CategoryAccent = "brand" | "cyan" | "violet" | "success";

export interface ToolCategoryItem {
  href: string;
  key: string;
  icon: LucideIcon;
}

export interface ToolCategory {
  labelKey: CategoryLabel;
  accent: CategoryAccent;
  items: ToolCategoryItem[];
}

export const CATEGORIES: ToolCategory[] = [
  {
    labelKey: "cat_dns",
    accent: "cyan",
    items: [
      { href: "/dns-lookup",      key: "dns",         icon: Search   },
      { href: "/dns-propagation", key: "propagation", icon: Globe2   },
      { href: "/dnssec",          key: "dnssec",      icon: Lock     },
      { href: "/whois",           key: "whois",       icon: Server   },
      { href: "/subdomains",      key: "subs",        icon: GitBranch },
    ],
  },
  {
    labelKey: "cat_network",
    accent: "brand",
    items: [
      { href: "/port-checker",    key: "ports",       icon: Network },
      { href: "/ip-lookup",       key: "ip",          icon: Globe   },
      { href: "/ipv6",            key: "ipv6",        icon: Wifi    },
      { href: "/bgp",             key: "bgp",         icon: Route   },
      { href: "/cdn-detector",    key: "cdn",         icon: Cloud   },
    ],
  },
  {
    labelKey: "cat_security",
    accent: "violet",
    items: [
      { href: "/ssl-check",       key: "ssl",         icon: Lock              },
      { href: "/blacklist",       key: "blacklist",   icon: ShieldX           },
      { href: "/jwt",             key: "jwt",         icon: KeyRound          },
      { href: "/password-leak",   key: "pwd",         icon: ShieldEllipsis    },
      { href: "/mixed-content",   key: "mixed",       icon: Unlock            },
    ],
  },
  {
    labelKey: "cat_email",
    accent: "success",
    items: [
      { href: "/email-verify",    key: "email",       icon: Mail        },
      { href: "/email-auth",      key: "email_auth",  icon: ShieldAlert },
    ],
  },
  {
    labelKey: "cat_web",
    accent: "cyan",
    items: [
      { href: "/http-headers",    key: "headers",     icon: ShieldCheck   },
      { href: "/tech-stack",      key: "tech",        icon: Layers        },
      { href: "/redirects",       key: "redirects",   icon: ArrowRightLeft },
      { href: "/opengraph",       key: "og",          icon: ImageIcon     },
      { href: "/cookies",         key: "cookies",     icon: Cookie        },
      { href: "/robots",          key: "robots",      icon: FileSearch    },
    ],
  },
];
