"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { ResultCard } from "@/components/tool-shell";

/**
 * Human-readable summary of the standard JWT claims (iat / exp / nbf /
 * sub) plus a derived "is this token currently valid?" status. Shown
 * above the raw header/payload cards so users get the answer they
 * usually came for at a glance.
 */
export function ClaimsCard({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const t = useTranslations("jwt");
  const now = Math.floor(Date.now() / 1000);

  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const iat = typeof payload.iat === "number" ? payload.iat : null;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : null;
  const expired = exp != null && exp < now;
  const notYetValid = nbf != null && nbf > now;

  const status = expired
    ? t("expired")
    : notYetValid
    ? t("not_yet")
    : t("valid");

  return (
    <ResultCard>
      <div className="grid gap-3 sm:grid-cols-4">
        <Claim
          label={t("claim_issued")}
          ok
          value={iat ? new Date(iat * 1000).toLocaleString() : "—"}
        />
        <Claim
          label={t("claim_expires")}
          ok={!expired}
          value={exp ? new Date(exp * 1000).toLocaleString() : "—"}
        />
        <Claim
          label={t("claim_status")}
          ok={!expired && !notYetValid}
          value={status}
        />
        <Claim
          label={t("claim_subject")}
          ok
          value={typeof payload.sub === "string" ? payload.sub : "—"}
        />
      </div>
    </ResultCard>
  );
}

function Claim({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase text-fg-subtle">
        {ok ? (
          <CheckCircle2 className="h-3 w-3 text-success" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-danger" />
        )}
        {label}
      </div>
      <div className={`mt-1 truncate font-mono text-sm ${ok ? "" : "text-danger"}`}>
        {value}
      </div>
    </div>
  );
}
