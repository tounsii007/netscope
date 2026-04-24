"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ResultCard } from "@/components/tool-shell";
import { AlertTriangle, CheckCircle2, Lock } from "lucide-react";

type Decoded = {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  raw: { header: string; payload: string; signature: string };
};

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 2 ? "==" : input.length % 4 === 3 ? "=" : "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return decodeURIComponent(
    atob(normalized).split("").map((c) =>
      "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
}

function decode(token: string): Decoded | null {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(b64urlDecode(parts[0])),
      payload: JSON.parse(b64urlDecode(parts[1])),
      signature: parts[2],
      raw: { header: parts[0], payload: parts[1], signature: parts[2] },
    };
  } catch { return null; }
}

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9." +
  "signature-placeholder";

export function JwtClient() {
  const t = useTranslations("jwt");
  const [token, setToken] = useState(SAMPLE);
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
          <AlertTriangle className="h-4 w-4" /> Not a valid JWT (expected three dot-separated base64url segments).
        </div>
      )}

      {decoded && (
        <>
          <Claims payload={decoded.payload} t={t} />
          <div className="grid gap-4 lg:grid-cols-2">
            <JsonCard title={t("header")} data={decoded.header} colorClass="text-brand" />
            <JsonCard title={t("payload")} data={decoded.payload} colorClass="text-success" />
          </div>
          <ResultCard>
            <h3 className="mb-2 text-sm font-semibold">{t("signature")} (not verified)</h3>
            <div className="break-all rounded-md bg-bg-elevated p-3 font-mono text-xs">
              {decoded.signature}
            </div>
            <p className="mt-2 text-xs text-fg-muted">
              {t("sig_note")}
            </p>
          </ResultCard>
        </>
      )}
    </div>
  );
}

function JsonCard({ title, data, colorClass }: { title: string; data: unknown; colorClass: string }) {
  return (
    <ResultCard>
      <h3 className={`mb-2 text-sm font-semibold ${colorClass}`}>{title}</h3>
      <pre className="max-h-80 overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ResultCard>
  );
}

function Claims({ payload, t }: { payload: Record<string, unknown>; t: ReturnType<typeof useTranslations> }) {
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const iat = typeof payload.iat === "number" ? payload.iat : null;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
  const expired = exp != null && exp < now;
  const notYetValid = nbf != null && nbf > now;

  return (
    <ResultCard>
      <div className="grid gap-3 sm:grid-cols-4">
        <Claim label={t("claim_issued")} ok value={iat ? new Date(iat * 1000).toLocaleString() : "—"} />
        <Claim label={t("claim_expires")} ok={!expired}
          value={exp ? new Date(exp * 1000).toLocaleString() : "—"} />
        <Claim label={t("claim_status")}
          ok={!expired && !notYetValid}
          value={expired ? t("expired") : notYetValid ? t("not_yet") : t("valid")} />
        <Claim label={t("claim_subject")} ok
          value={typeof payload.sub === "string" ? payload.sub : "—"} />
      </div>
    </ResultCard>
  );
}

function Claim({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase text-fg-subtle">
        {ok ? <CheckCircle2 className="h-3 w-3 text-success" />
            : <AlertTriangle className="h-3 w-3 text-danger" />}
        {label}
      </div>
      <div className={`mt-1 truncate font-mono text-sm ${ok ? "" : "text-danger"}`}>{value}</div>
    </div>
  );
}
