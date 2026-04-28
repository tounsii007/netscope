"use client";

import { useTranslations } from "next-intl";
import type { IpResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";
import { CountryFlag } from "@/app/[locale]/ip-lookup/country-flag";
import { LocalTime } from "@/app/[locale]/ip-lookup/local-time";
import { Field } from "@/app/[locale]/ip-lookup/shared-pieces";
import { CoordsField } from "@/app/[locale]/ip-lookup/coords-field";
import { ExternalToolLinks } from "@/app/[locale]/ip-lookup/external-tools";

/**
 * Main result grid: every IP attribute the backend returned, ending in
 * a row of one-click jumps into BGP / Shodan / AbuseIPDB / VirusTotal
 * for deeper investigation. The coordinate copy-button and the external
 * link row live in their own files so this component stays declarative.
 */
export function DetailGrid({
  data,
  countryName,
}: {
  data: IpResult;
  countryName: string;
}) {
  const t = useTranslations("ip");

  return (
    <ResultCard className="lg:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label={t("field_ip")} value={data.ip} mono />
        <Field label={t("field_hostname")} value={data.hostname} mono />
        <Field
          label={t("field_country")}
          value={
            data.country ? (
              <span className="inline-flex items-center gap-2">
                <CountryFlag code={data.country} />
                <span>{countryName || data.country}</span>
                {countryName && countryName !== data.country && (
                  <span className="text-xs text-fg-subtle">({data.country})</span>
                )}
              </span>
            ) : undefined
          }
        />
        <Field label={t("field_region")} value={data.region} />
        <Field label={t("field_city")} value={data.city} />
        <Field
          label={t("field_timezone")}
          value={
            data.timezone ? (
              <span className="inline-flex items-center gap-2">
                <span>{data.timezone}</span>
                <span className="text-xs text-fg-subtle">
                  <LocalTime tz={data.timezone} />
                </span>
              </span>
            ) : undefined
          }
        />
        <Field label={t("field_isp")} value={data.isp ?? data.org} />
        <Field label={t("field_asn")} value={data.asn} mono />
        {data.lat != null && data.lon != null && (
          <Field
            label={t("field_coords")}
            value={<CoordsField lat={data.lat} lon={data.lon} />}
          />
        )}
        {data.org && data.org !== data.isp && (
          <Field label={t("field_org") || "Organization"} value={data.org} />
        )}
        {data.client?.userAgent && (
          <Field
            label={t("field_user_agent") || "Your User-Agent"}
            value={data.client.userAgent}
            mono
          />
        )}
      </div>

      <ExternalToolLinks ip={data.ip} />
    </ResultCard>
  );
}
