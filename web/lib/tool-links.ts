/**
 * Flat list of every tool route in the app, with its translation key
 * under `nav.tools.*`. Lives in lib/ rather than buried inside site-nav
 * so it's the single source of truth across:
 *
 *   • desktop nav (categorised, in components/site-nav)
 *   • mobile drawer (categorised, in components/mobile-nav)
 *   • home-page tool grid
 *   • 404 "did you mean…?" Levenshtein matcher
 *
 * Adding a new tool means appending one line here.
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
