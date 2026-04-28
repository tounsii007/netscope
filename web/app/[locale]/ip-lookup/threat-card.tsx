"use client";

import { useTranslations } from "next-intl";
import type { IpResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";
import { ThreatPill } from "./shared-pieces";
import { riskColor } from "./ip-utils";

/**
 * Compact threat-intelligence sidecar. Only mounts when the API actually
 * returned a `threat` field — provider failures simply hide this card
 * rather than show empty rows.
 */
export function ThreatCard({ data }: { data: IpResult }) {
  const t = useTranslations("ip");
  if (!data.threat) return null;

  return (
    <ResultCard>
      <h3 className="mb-3 text-sm font-semibold">{t("threat_title")}</h3>
      <div className="mb-4 flex items-baseline gap-2">
        <span
          className="text-4xl font-semibold"
          style={{ color: riskColor(data.threat.riskScore) }}
        >
          {data.threat.riskScore}
        </span>
        <span className="text-xs text-fg-muted">{t("risk_score")}</span>
      </div>
      <div className="space-y-1.5 text-sm">
        <ThreatPill label={t("threat_tor")} v={data.threat.tor} />
        <ThreatPill label={t("threat_hosting")} v={data.threat.hosting} />
        <ThreatPill label={t("threat_vpn")} v={data.threat.vpn} />
        <ThreatPill label={t("threat_proxy")} v={data.threat.proxy} />
        <ThreatPill label={t("threat_residential")} v={data.threat.residential} good />
      </div>
    </ResultCard>
  );
}
