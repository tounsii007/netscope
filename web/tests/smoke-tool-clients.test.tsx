/**
 * Smoke tests for the bulk of tool-page clients.
 *
 * Each test renders the component (no API call — only the form on first render)
 * and asserts the most invariant piece of UI: the submit button. This drives
 * the form-rendering / i18n-resolution path through coverage and catches:
 *   • Regression where a translation key is renamed but the component still
 *     references the old one (would throw MISSING_MESSAGE on render).
 *   • Build-time TypeScript drift where a client stops compiling.
 *   • Missing default state crashes (e.g. unguarded useSearchParams).
 *
 * Heavier interaction tests live in the per-client files.
 */
import { describe, it, expect } from "vitest";
import { Suspense } from "react";
import { renderWithIntl, screen } from "./test-utils";

import { BgpClient }          from "@/app/[locale]/bgp/client";
import { BlacklistClient }    from "@/app/[locale]/blacklist/client";
import { CdnClient }          from "@/app/[locale]/cdn-detector/client";
import { CookieClient }       from "@/app/[locale]/cookies/client";
import { DnsClient }          from "@/app/[locale]/dns-lookup/client";
import { PropagationClient }  from "@/app/[locale]/dns-propagation/client";
import { DnssecClient }       from "@/app/[locale]/dnssec/client";
import { EmailAuthClient }    from "@/app/[locale]/email-auth/client";
import { EmailVerifyClient }  from "@/app/[locale]/email-verify/client";
import { HeadersClient }      from "@/app/[locale]/http-headers/client";
import { Ipv6Client }         from "@/app/[locale]/ipv6/client";
import { JwtClient }          from "@/app/[locale]/jwt/client";
import { MixedClient }        from "@/app/[locale]/mixed-content/client";
import { OgClient }           from "@/app/[locale]/opengraph/client";
import { ReachClient }        from "@/app/[locale]/reachability/client";
import { RedirectsClient }    from "@/app/[locale]/redirects/client";
import { SslClient }          from "@/app/[locale]/ssl-check/client";
import { SubdomainsClient }   from "@/app/[locale]/subdomains/client";
import { TechClient }         from "@/app/[locale]/tech-stack/client";

const clients = [
  ["BgpClient",         <BgpClient />],
  ["BlacklistClient",   <BlacklistClient />],
  ["CdnClient",         <CdnClient />],
  ["CookieClient",      <CookieClient />],
  ["DnsClient",         <DnsClient />],
  ["PropagationClient", <PropagationClient />],
  ["DnssecClient",      <DnssecClient />],
  ["EmailAuthClient",   <EmailAuthClient />],
  ["EmailVerifyClient", <EmailVerifyClient />],
  ["HeadersClient",     <HeadersClient />],
  ["Ipv6Client",        <Ipv6Client />],
  ["JwtClient",         <JwtClient />],
  ["MixedClient",       <MixedClient />],
  ["OgClient",          <OgClient />],
  ["ReachClient",       <ReachClient />],
  ["RedirectsClient",   <RedirectsClient />],
  ["SslClient",         <SslClient />],
  ["SubdomainsClient",  <SubdomainsClient />],
  ["TechClient",        <TechClient />],
] as const;

describe("Tool client smoke tests", () => {
  it.each(clients)("renders %s without throwing", (_name, ui) => {
    // Some clients may use useSearchParams which requires Suspense
    renderWithIntl(<Suspense fallback={null}>{ui}</Suspense>);
    // Each client renders at least one interactive control:
    // a button (search/check/lookup/scan) OR a textbox (textarea, input).
    const buttons  = screen.queryAllByRole("button");
    const textbox  = screen.queryAllByRole("textbox");
    expect(buttons.length + textbox.length).toBeGreaterThanOrEqual(1);
  });
});
