import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://netscope.io";

const tools = [
  "", "/port-checker", "/ip-lookup", "/dns-lookup", "/dns-propagation",
  "/http-headers", "/subdomains", "/cdn-detector", "/ssl-check",
  "/whois", "/reachability", "/email-verify", "/email-auth", "/blacklist",
  "/redirects", "/tech-stack", "/jwt", "/password-leak",
  "/dnssec", "/cookies", "/opengraph", "/robots",
  "/ipv6", "/bgp", "/mixed-content",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return tools.map((path) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1.0 : 0.8,
  }));
}
