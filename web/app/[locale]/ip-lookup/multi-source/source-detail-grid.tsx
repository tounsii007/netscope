"use client";

import { useTranslations } from "next-intl";
import type { IpSourceEntry } from "@/lib/api";

type SourceData = NonNullable<IpSourceEntry["data"]>;

/**
 * Grid of every interesting field a single provider returned. The order
 * is intentional: identifying fields first (IP, hostname), then core
 * geolocation, then network, then everything else — so when comparing
 * providers side-by-side the rows line up sensibly.
 */
export function SourceDetailGrid({ data }: { data: SourceData }) {
  const t = useTranslations("ip");

  const orderedKeys: Array<{
    key: keyof SourceData;
    label: string;
    mono?: boolean;
  }> = [
    { key: "ip", label: t("field_ip"), mono: true },
    { key: "type", label: t("multi_iptype") },
    { key: "hostname", label: t("field_hostname"), mono: true },
    { key: "city", label: t("field_city") },
    { key: "region", label: t("field_region") },
    { key: "country", label: t("field_country") },
    { key: "country_name", label: t("multi_country_name") },
    { key: "continent", label: t("multi_continent") },
    { key: "postal", label: t("multi_postal") },
    { key: "timezone", label: t("field_timezone") },
    { key: "lat", label: t("multi_lat") },
    { key: "lon", label: t("multi_lon") },
    { key: "asn", label: t("field_asn"), mono: true },
    { key: "isp", label: t("field_isp") },
    { key: "org", label: t("multi_org") },
    { key: "domain", label: t("multi_domain") },
    { key: "currency", label: t("multi_currency") },
    { key: "calling_code", label: t("multi_calling_code") },
    { key: "languages", label: t("multi_languages") },
  ];

  return (
    <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
      {orderedKeys.map(({ key, label, mono }) => {
        const v = data[key];
        if (v === undefined || v === null || v === "") return null;
        return (
          <div key={String(key)}>
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle">
              {label}
            </div>
            <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>
              {String(v)}
            </div>
          </div>
        );
      })}
      {(data.in_eu === true || data.is_eu === true) && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-fg-subtle">
            {t("multi_eu")}
          </div>
          <div className="text-sm">✓ EU</div>
        </div>
      )}
    </div>
  );
}
