"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle, Clock, User2, ShieldCheck } from "lucide-react";
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
    <ResultCard className={`relative overflow-hidden border-l-4 ${
      expired || notYetValid ? "border-l-danger/50" : "border-l-success/50"
    }`}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Claim
          icon={<Clock className="h-3 w-3" />}
          label={t("claim_issued")}
          ok
          value={iat ? new Date(iat * 1000).toLocaleString() : "—"}
        />
        <Claim
          icon={<Clock className="h-3 w-3" />}
          label={t("claim_expires")}
          ok={!expired}
          value={exp ? new Date(exp * 1000).toLocaleString() : "—"}
        />
        <Claim
          icon={<ShieldCheck className="h-3 w-3" />}
          label={t("claim_status")}
          ok={!expired && !notYetValid}
          value={status}
          highlight
        />
        <Claim
          icon={<User2 className="h-3 w-3" />}
          label={t("claim_subject")}
          ok
          value={typeof payload.sub === "string" ? payload.sub : "—"}
        />
      </div>
    </ResultCard>
  );
}

function Claim({
  icon,
  label,
  value,
  ok,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        ok
          ? "border-border/60 bg-bg-elevated/60"
          : "border-danger/30 bg-danger/5 ring-1 ring-danger/20"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {ok ? (
          <CheckCircle2 className="h-3 w-3 text-success" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-danger" aria-hidden="true" />
        )}
        <span className="text-violet-soft/70">{icon}</span>
        {label}
      </div>
      <div
        className={`mt-1.5 truncate font-mono text-sm ${
          ok
            ? highlight
              ? "font-semibold text-success"
              : "text-fg"
            : "font-semibold text-danger"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
