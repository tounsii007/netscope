"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type IpResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

const IpMap = dynamic(() => import("@/components/ip-map"), { ssr: false });

/**
 * Convert a 2-letter ISO country code to its flag emoji by mapping each
 * letter to the corresponding regional indicator codepoint (A → 0x1F1E6).
 * Returns the empty string for invalid input so the UI degrades gracefully.
 */
function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return "";
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

/**
 * Strip every whitespace character from anywhere inside an IP literal.
 * Users often paste with leading/trailing spaces or with stray spaces
 * between octets — none of those should produce "invalid IP".
 */
function normaliseIp(input: string): string {
  return input.replace(/\s+/g, "").trim();
}

export function IpClient({ initial }: { initial?: IpResult }) {
  const t = useTranslations("ip");
  const tc = useTranslations("common");
  const params = useSearchParams();
  const prefill = params.get("host") ?? params.get("ip");
  const [ip, setIp] = useState(prefill ?? "8.8.8.8");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<IpResult | null>(initial ?? null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = normaliseIp(ip);
    if (cleaned !== ip) setIp(cleaned);   // reflect the cleaned value in the input
    await lookup(cleaned);
  }

  async function lookup(target: string) {
    const cleaned = normaliseIp(target);
    if (!cleaned) { setErr(tc("input_required")); setData(null); return; }
    setErr(null); setLoading(true);
    try { setData(await api.ip(cleaned)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (prefill) lookup(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const flag = countryFlag(data?.country);

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input
          className="input"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onBlur={(e) => setIp(normaliseIp(e.target.value))}
          placeholder={t("placeholder")}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("lookup")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ResultCard className="lg:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("field_ip")} value={data.ip} mono />
                <Field label={t("field_hostname")} value={data.hostname} mono />
                <Field
                  label={t("field_country")}
                  value={
                    data.country ? (
                      <span className="inline-flex items-center gap-2">
                        {flag && <span className="text-xl leading-none" aria-hidden="true">{flag}</span>}
                        <span>{data.country}</span>
                      </span>
                    ) : undefined
                  }
                />
                <Field label={t("field_region")} value={data.region} />
                <Field label={t("field_city")} value={data.city} />
                <Field label={t("field_timezone")} value={data.timezone} />
                <Field label={t("field_isp")} value={data.isp ?? data.org} />
                <Field label={t("field_asn")} value={data.asn} mono />
                {data.lat != null && data.lon != null && (
                  <Field
                    label={t("field_coords")}
                    value={
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${data.lat}&mlon=${data.lon}#map=12/${data.lat}/${data.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:text-brand transition"
                      >
                        {data.lat.toFixed(4)}, {data.lon.toFixed(4)} ↗
                      </a>
                    }
                  />
                )}
                {/* Extra context that's almost always available — pulled from the
                    same response, no extra API roundtrip. */}
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

              {/* External tool shortcuts — actionable, not just text */}
              <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                <ExternalLink href={`https://bgp.he.net/ip/${encodeURIComponent(data.ip)}`}>
                  BGP details
                </ExternalLink>
                <ExternalLink href={`https://www.shodan.io/host/${encodeURIComponent(data.ip)}`}>
                  Shodan
                </ExternalLink>
                <ExternalLink href={`https://www.abuseipdb.com/check/${encodeURIComponent(data.ip)}`}>
                  AbuseIPDB
                </ExternalLink>
                <ExternalLink href={`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(data.ip)}`}>
                  VirusTotal
                </ExternalLink>
              </div>
            </ResultCard>

            {data.threat && (
              <ResultCard>
                <h3 className="mb-3 text-sm font-semibold">{t("threat_title")}</h3>
                <div className="mb-4 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold" style={{ color: riskColor(data.threat.riskScore) }}>
                    {data.threat.riskScore}
                  </span>
                  <span className="text-xs text-fg-muted">{t("risk_score")}</span>
                </div>
                <div className="space-y-1.5 text-sm">
                  <Flag label={t("threat_tor")} v={data.threat.tor} />
                  <Flag label={t("threat_hosting")} v={data.threat.hosting} />
                  <Flag label={t("threat_vpn")} v={data.threat.vpn} />
                  <Flag label={t("threat_proxy")} v={data.threat.proxy} />
                  <Flag label={t("threat_residential")} v={data.threat.residential} good />
                </div>
              </ResultCard>
            )}
          </div>

          {data.lat != null && data.lon != null && (
            <ResultCard className="p-0 overflow-hidden">
              {/* key={ip} forces React to fully remount the map component when
                  the IP changes, guaranteeing a clean center+zoom even if the
                  inner FlyTo hook ever misfires. */}
              <IpMap
                key={data.ip}
                lat={data.lat}
                lon={data.lon}
                label={`${data.ip} · ${flag} ${data.city ?? ""}`.trim()}
              />
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-muted hover:bg-brand/10 hover:text-brand transition"
    >
      {children} ↗
    </a>
  );
}

function Flag({ label, v, good }: { label: string; v: boolean; good?: boolean }) {
  const positive = good ? v : !v;
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-elevated px-2.5 py-1">
      <span className="text-fg-muted">{label}</span>
      <span className={positive ? "text-success text-xs" : "text-danger text-xs"}>{v ? "yes" : "no"}</span>
    </div>
  );
}

function riskColor(score: number) {
  if (score >= 70) return "#ef4444";
  if (score >= 40) return "#f59e0b";
  return "#10b981";
}
