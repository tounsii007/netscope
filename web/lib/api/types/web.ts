/**
 * Web-page analysis result types: HTTP security headers, redirect
 * tracing, cookie/GDPR audit, OG-tag preview, robots.txt + sitemap
 * validation, mixed-content scanning.
 */

export type HeadersResult = {
  url: string; status: number; grade: string; score: number;
  server?: string; poweredBy?: string;
  checks: Array<{
    header: string; present: boolean; good: boolean;
    value: string; weight: number; detail: string;
  }>;
  rawHeaders: Record<string, string>;
};

export type RedirectResult = {
  input: string; finalUrl: string | null;
  hopCount: number; finalStatusCode: number; finalStatus: string;
  httpsDowngrade: boolean;
  hops: Array<{
    hop: number; url: string; scheme: string; host: string;
    status: number; latencyMs?: number; location?: string; error?: string;
  }>;
  warnings: string[];
};

export type CookieResult = {
  url: string;
  cookieCount: number; insecureCookies: number;
  cookiesWithoutSameSite: number; trackerCount: number;
  gdprRiskScore: number;
  cookies: Array<{ name?: string; secure?: boolean; httpOnly?: boolean; sameSite?: string }>;
  trackers: Array<{ name: string; category: string; pattern: string }>;
  thirdPartyHosts: string[];
};

export type OgResult = {
  url: string;
  title?: string; description?: string; image?: string; favicon?: string;
  siteName?: string; type?: string; twitterCard?: string;
  allMeta: Record<string, string>;
  warnings: string[];
};

export type RobotsResult = {
  host: string;
  robots: {
    url: string; status?: number; raw?: string;
    rules?: Record<string, string[]>; sitemaps?: string[];
    warnings?: string[]; error?: string;
  };
  sitemaps: Array<{
    url: string; status?: number; urlCount?: number;
    sample?: string[]; isIndex?: boolean; error?: string;
  }>;
};

export type MixedResult = {
  url: string; clean: boolean;
  totalInsecureResources: number; blockingResources: number; passiveResources: number;
  byType: Record<string, string[]>;
  warnings: string[];
};
