"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Lock } from "lucide-react";
import { ResultCard } from "@/components/tool-shell";
import { decode, SAMPLE_JWT } from "@/app/[locale]/jwt/jwt-decode";
import { ClaimsCard } from "@/app/[locale]/jwt/claims-card";
import { JsonCard } from "@/app/[locale]/jwt/json-card";

/**
 * JWT-Decoder orchestrator. Owns just the input state; everything else
 * is delegated to focused children:
 *   • jwt-decode.ts — pure parsing helpers + sample token
 *   • claims-card    — iat/exp/nbf/sub summary
 *   • json-card      — pretty-printed header + payload viewers
 *
 * No network calls — decoding is entirely client-side, the token never
 * leaves the device, and we deliberately don't even log it.
 */
export function JwtClient() {
  const t = useTranslations("jwt");
  const [token, setToken] = useState(SAMPLE_JWT);
  const decoded = useMemo(() => decode(token), [token]);

  return (
    <div className="space-y-6">
      <ResultCard>
        <div className="mb-2 flex items-center gap-2 text-xs text-fg-muted">
          <Lock className="h-3.5 w-3.5" /> {t("sig_note")}
        </div>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          rows={6}
          className="input w-full resize-y font-mono text-xs break-all"
          placeholder={t("placeholder")}
        />
      </ResultCard>

      {!decoded && token.trim() && (
        <div className="card border-danger/50 text-danger flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Not a valid JWT (expected three dot-separated base64url segments).
        </div>
      )}

      {decoded && (
        <>
          <ClaimsCard payload={decoded.payload} />
          <div className="grid gap-4 lg:grid-cols-2">
            <JsonCard
              title={t("header")}
              data={decoded.header}
              colorClass="text-brand"
            />
            <JsonCard
              title={t("payload")}
              data={decoded.payload}
              colorClass="text-success"
            />
          </div>
          <ResultCard>
            <h3 className="mb-2 text-sm font-semibold">
              {t("signature")} (not verified)
            </h3>
            <div className="break-all rounded-md bg-bg-elevated p-3 font-mono text-xs">
              {decoded.signature}
            </div>
            <p className="mt-2 text-xs text-fg-muted">{t("sig_note")}</p>
          </ResultCard>
        </>
      )}
    </div>
  );
}
