/**
 * Email-related result types: address verification, SPF/DKIM/DMARC
 * authentication audit, and IP blacklist checks (closely tied because
 * they share the "is this mail server trustworthy?" use case).
 */

export type EmailVerifyResult = {
  email: string; local: string; domain: string;
  syntaxValid: boolean; disposable: boolean; role: boolean;
  mx: string[]; hasMx: boolean;
  score: number; deliverable: boolean;
  smtp?: { mx: string; code?: number; accepted: boolean; error?: string };
};

export type EmailAuthResult = {
  domain: string;
  spf:   { present: boolean; record?: string; strict?: boolean; warnings: string[] };
  dmarc: {
    present: boolean; record?: string; policy?: string; subdomainPolicy?: string;
    percent?: string; reportingTo?: string; warnings: string[];
  };
  dkim:  { present: boolean; selector?: string; record?: string; warnings?: string[] };
  score: number;
};

/**
 * Standalone DKIM key-fetch result. Distinct from {@link EmailAuthResult}
 * which only reports DKIM presence as part of a combined SPF/DMARC audit;
 * this surfaces the key bytes + algorithm + size + warnings about weak or
 * revoked configurations.
 */
export type DkimResult = {
  domain: string;
  selector: string | null;
  triedSelectors: string[];
  result: {
    queriedHost?: string;
    present: boolean;
    rawRecord?: string;
    tags?: Record<string, string>;
    keyType?: string;
    keyAlgorithm?: string;
    keySize?: number;
    publicKeyBase64?: string;
    hashAlgorithms?: string[];
    serviceType?: string;
    flags?: string;
    notes?: string;
    revoked?: boolean;
    warnings?: string[];
  };
};

export type BlacklistResult = {
  ip: string; totalChecked: number; listedCount: number; clean: boolean;
  reputationScore: number; durationMs: number;
  results: Array<{
    list: string; listed: boolean; responseCodes?: string[]; error?: string;
  }>;
};
