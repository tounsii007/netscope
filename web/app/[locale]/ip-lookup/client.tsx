"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type IpResult } from "@/lib/api";
import { ResultCard, LoadingButton } from "@/components/tool-shell";
import { MultiSourcePanel } from "./multi-source-panel";
import { useCountryName } from "./use-country-name";
import { LocationBanner } from "./location-banner";
import { DetailGrid } from "./detail-grid";
import { ThreatCard } from "./threat-card";
import { normaliseIp } from "./ip-utils";

// The map is heavy (Leaflet + tiles) and never needed on first paint, so
// we defer it client-side and skip SSR entirely.
const IpMap = dynamic(() => import("@/components/ip-map"), { ssr: false });

/**
 * IP-Lookup orchestrator. Owns the input state and the network call, then
 * delegates rendering to focused children:
 *   • LocationBanner — flag, location line, timezone clock, map shortcuts
 *   • DetailGrid     — every attribute the API returned + investigation
 *                      jumps (BGP, Shodan, AbuseIPDB, VirusTotal)
 *   • ThreatCard     — TOR/VPN/Proxy/hosting flags + risk score
 *   • IpMap          — Leaflet map (lazy)
 *   • MultiSourcePanel — side-by-side comparison of geolocation providers
 */
export function IpClient({ initial }: { initial?: IpResult }) {
  const t = useTranslations("ip");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const prefill = params.get("host") ?? params.get("ip");

  const [ip, setIp] = useState(prefill ?? "8.8.8.8");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<IpResult | null>(initial ?? null);

  async function lookup(target: string) {
    const cleaned = normaliseIp(target);
    if (!cleaned) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      setData(await api.ip(cleaned));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = normaliseIp(ip);
    if (cleaned !== ip) setIp(cleaned);
    await lookup(cleaned);
  }

  // Auto-run when the URL has ?host= / ?ip= (deep links from other tools).
  useEffect(() => {
    if (prefill) lookup(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const countryName = useCountryName(data?.country);

  // Build "City, Region, Country" line for the banner, dropping empties.
  const locationLine = useMemo(() => {
    if (!data) return "";
    const parts = [data.city, data.region, countryName || data.country].filter(
      (p) => !!p && String(p).trim().length > 0
    );
    return parts.join(", ");
  }, [data, countryName]);

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onBlur={(e) => setIp(normaliseIp(e.target.value))}
          placeholder={t("placeholder")}
          autoComplete="off"
          spellCheck={false}
        />
        <LoadingButton loading={loading} loadingLabel={tc("loading")}>
          {tc("lookup")}
        </LoadingButton>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <LocationBanner data={data} locationLine={locationLine} />

          <div className="grid gap-4 lg:grid-cols-3">
            <DetailGrid data={data} countryName={countryName} />
            <ThreatCard data={data} />
          </div>

          {data.lat != null && data.lon != null && (
            <ResultCard className="p-0 overflow-hidden">
              {/* key={ip} forces a clean remount on every new lookup so the
                  map cleanly recenters even if a FlyTo hook misfires. */}
              <IpMap
                key={data.ip}
                lat={data.lat}
                lon={data.lon}
                label={`${data.ip} · ${data.city ?? data.country ?? ""}`.trim()}
              />
            </ResultCard>
          )}

          <MultiSourcePanel ip={data.ip} />
        </>
      )}
    </div>
  );
}
