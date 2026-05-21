"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Lock, KeyRound, FileSignature, ShieldOff } from "lucide-react";
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
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-brand/10 text-violet-soft ring-1 ring-violet-brand/25">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-fg">
            JWT
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn ring-1 ring-warn/20">
            <ShieldOff className="h-3 w-3" aria-hidden="true" />
            {t("sig_note")}
          </span>
        </div>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          spellCheck={false}
          rows={6}
          className="input w-full resize-y font-mono text-xs leading-relaxed break-all"
          placeholder={t("placeholder")}
        />
      </ResultCard>

      {!decoded && token.trim() && (
        <div
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Not a valid JWT (expected three dot-separated base64url segments).</span>
        </div>
      )}

      {decoded && (
        <>
          <ClaimsCard payload={decoded.payload} />
          <div className="grid gap-4 lg:grid-cols-2">
            <JsonCard
              title={t("header")}
              data={decoded.header}
              colorClass="text-violet-soft"
            />
            <JsonCard
              title={t("payload")}
              data={decoded.payload}
              colorClass="text-success"
            />
          </div>
          <ResultCard>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-brand/10 text-violet-soft ring-1 ring-violet-brand/25">
                <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("signature")}
              <span className="inline-flex items-center gap-1 rounded-md border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn">
                <KeyRound className="h-3 w-3" aria-hidden="true" />
                Not verified
              </span>
            </h3>
            <div className="break-all rounded-xl border border-border bg-bg-elevated/60 p-3 font-mono text-xs leading-relaxed text-fg-muted">
              {decoded.signature}
            </div>
            <p className="mt-2.5 text-xs text-fg-subtle">{t("sig_note")}</p>
          </ResultCard>
        </>
      )}
    </div>
  );
}
