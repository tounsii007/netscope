"use client";

import { ExternalLink } from "@/app/[locale]/ip-lookup/shared-pieces";

/**
 * Footer row of the IP detail card with one-click jumps to BGP /
 * Shodan / AbuseIPDB / VirusTotal. Lives separately so adding new
 * investigation targets is a one-line edit and so the detail-grid
 * file stays focused on attribute rendering.
 */
export function ExternalToolLinks({ ip }: { ip: string }) {
  const enc = encodeURIComponent(ip);
  return (
    <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
      <ExternalLink href={`https://bgp.he.net/ip/${enc}`}>BGP details</ExternalLink>
      <ExternalLink href={`https://www.shodan.io/host/${enc}`}>Shodan</ExternalLink>
      <ExternalLink href={`https://www.abuseipdb.com/check/${enc}`}>AbuseIPDB</ExternalLink>
      <ExternalLink href={`https://www.virustotal.com/gui/ip-address/${enc}`}>VirusTotal</ExternalLink>
    </div>
  );
}
