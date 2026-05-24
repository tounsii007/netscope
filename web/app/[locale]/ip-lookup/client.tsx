"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { api, type IpResult } from "@/lib/api";
import { ResultCard, LoadingButton } from "@/components/tool-shell";
import { SkeletonCard } from "@/components/skeleton";
import { RecentTargets } from "@/components/recent-targets";
import { ShareLink } from "@/components/share-link";
import { InputStatus } from "@/components/input-status";
import { useRecentTargets } from "@/lib/use-recent-targets";
import { useDeepLink } from "@/lib/use-deep-link";
import { isHostOrIp, validateInput } from "@/lib/input-validators";
import { MultiSourcePanel } from "./multi-source-panel";
import { useCountryName } from "./use-country-name";
import { LocationBanner } from "./location-banner";
import { DetailGrid } from "./detail-grid";
import { ThreatCard } from "./threat-card";
import { normaliseIp } from "./ip-utils";
import { checkTargetGuard } from "@/lib/target-guard";

// The map is heavy (Leaflet + tiles) and never needed on first paint, so
// we defer it client-side and skip SSR entirely. The loading prop gives
// users a shimmer placeholder instead of a 300x500-ish blank panel
// while the leaflet chunk downloads (~80 KB gzipped + a tiles roundtrip).
const IpMap = dynamic(() => import("@/components/ip-map"), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse bg-bg-elevated/80 ring-1 ring-border/40" style={{ height: 320 }} aria-hidden="true" />
  ),
});

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
  const tg = useTranslations("guard");
  const tn = useTranslations("nav.tools");
  const inputId = useId();
  const params = useSearchParams();
  const prefill = params.get("host") ?? params.get("ip");

  const [ip, setIp] = useState(prefill ?? "8.8.8.8");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<IpResult | null>(initial ?? null);

  const { recent, remember, forget } = useRecentTargets("ip-lookup");
  const { buildUrl, pushUrl } = useDeepLink({
    setTarget: setIp,
    onAutoRun: () => lookup(ip),
  });
  const ipStatus = useMemo(
    () => validateInput(ip, isHostOrIp, tc("invalid_host_shape")),
    [ip, tc],
  );

  async function lookup(target: string) {
    const cleaned = normaliseIp(target);
    if (!cleaned) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    const guard = checkTargetGuard(cleaned);
    if (!guard.ok) {
      setErr(tg(guard.reasonKey));
      setData(null);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      setData(await api.ip(cleaned));
      remember(cleaned);
      pushUrl(cleaned);
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
      <form onSubmit={run} noValidate className="card space-y-3" aria-label={tn("ip")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">{tc("enter_host")}</label>
          <input
            id={inputId}
            className="input"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            onBlur={(e) => setIp(normaliseIp(e.target.value))}
            placeholder={t("placeholder")}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
          <LoadingButton loading={loading} loadingLabel={tc("loading")}>
            {tc("lookup")}
          </LoadingButton>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <RecentTargets recent={recent} onPick={setIp} onForget={forget} currentValue={ip} />
            <InputStatus result={ipStatus} />
          </div>
          <ShareLink url={buildUrl(ip)} />
        </div>
      </form>

      {err && (
        <div
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{err}</span>
        </div>
      )}

      {loading && !data && (
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonCard count={2} className="lg:col-span-2" />
          <SkeletonCard />
        </div>
      )}

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
