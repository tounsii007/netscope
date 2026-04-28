/**
 * Result types for the IPv6-readiness scoring tool and the BGP/ASN
 * routing-table inspection endpoints.
 */

export type Ipv6Result = {
  domain: string; score: number;
  apex: { a: boolean; aaaa: boolean };
  www:  { a: boolean; aaaa: boolean };
  nameservers: { total: number; withIpv6: number; hosts: string[] };
  mxRecords:   { total: number; withIpv6: number; hosts: string[] };
  warnings: string[];
};

export type BgpIpResult = {
  ip: string; prefix?: string; announced?: boolean; block?: string;
  asns: Array<{ asn: string; holder: string }>;
  relatedPrefixes: string[];
  geo?: { country?: string; city?: string };
};

export type BgpAsnResult = {
  asn: string; holder?: string;
  announcedPrefixes: number; neighbourCount: number;
  prefixSample: string[];
};
