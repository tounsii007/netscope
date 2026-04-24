"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type IpResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

const IpMap = dynamic(() => import("@/components/ip-map"), { ssr: false });

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
    await lookup(ip);
  }

  async function lookup(target: string) {
    setErr(null); setLoading(true);
    try { setData(await api.ip(target)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (prefill) lookup(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder={t("placeholder")} required />
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
                <Field label={t("field_country")} value={data.country} />
                <Field label={t("field_region")} value={data.region} />
                <Field label={t("field_city")} value={data.city} />
                <Field label={t("field_timezone")} value={data.timezone} />
                <Field label={t("field_isp")} value={data.isp ?? data.org} />
                <Field label={t("field_asn")} value={data.asn} mono />
                {data.lat != null && <Field label={t("field_coords")} value={`${data.lat}, ${data.lon}`} mono />}
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
              <IpMap lat={data.lat} lon={data.lon} label={`${data.ip} · ${data.city ?? ""}`} />
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
      <div className={`text-sm ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
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
