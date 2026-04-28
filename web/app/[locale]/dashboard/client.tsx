"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type IpResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

export function DashboardClient() {
  const t = useTranslations("dashboard");
  const [data, setData] = useState<IpResult | null>(null);
  const [screen, setScreen] = useState<string>("");
  const [tz, setTz] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setScreen(`${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`);
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    api.me().then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="card border-danger/50 text-danger">{err}</div>;
  if (!data) return <div className="card flex items-center gap-2"><Spinner /> {t("detecting")}</div>;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <ResultCard>
        <h3 className="mb-2 text-sm font-semibold">{t("section_connection")}</h3>
        <Row l={t("field_ip")} v={data.ip} mono />
        <Row l={t("field_hostname")} v={data.hostname} mono />
        <Row l={t("field_isp")} v={data.isp ?? data.org} />
        <Row l={t("field_asn")} v={data.asn} mono />
      </ResultCard>

      <ResultCard>
        <h3 className="mb-2 text-sm font-semibold">{t("section_location")}</h3>
        <Row l={t("field_country")} v={data.country} />
        <Row l={t("field_region")} v={data.region} />
        <Row l={t("field_city")} v={data.city} />
        <Row l={t("field_tz_ip")} v={data.timezone} />
        <Row l={t("field_tz_browser")} v={tz} />
      </ResultCard>

      <ResultCard>
        <h3 className="mb-2 text-sm font-semibold">{t("section_client")}</h3>
        <Row l={t("field_browser")} v={data.client?.browser} />
        <Row l={t("field_os")} v={data.client?.os} />
        <Row l={t("field_device")} v={data.client?.device} />
        <Row l={t("field_screen")} v={screen} mono />
        <Row l={t("field_lang")} v={data.client?.acceptLanguage} mono />
      </ResultCard>

      {data.threat && (
        <ResultCard className="lg:col-span-3">
          <h3 className="mb-3 text-sm font-semibold">{t("section_threat")}</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Pill label={t("threat_tor")} v={data.threat.tor} bad />
            <Pill label={t("threat_hosting")} v={data.threat.hosting} bad />
            <Pill label={t("threat_vpn")} v={data.threat.vpn} bad />
            <Pill label={t("threat_proxy")} v={data.threat.proxy} bad />
            <Pill label={t("threat_residential")} v={data.threat.residential} />
          </div>
        </ResultCard>
      )}
    </div>
  );
}

function Row({ l, v, mono }: { l: string; v?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 py-1.5 last:border-0 text-sm">
      <span className="text-fg-muted">{l}</span>
      <span className={`truncate ${mono ? "font-mono" : ""}`}>{v ?? "—"}</span>
    </div>
  );
}

function Pill({ label, v, bad }: { label: string; v: boolean; bad?: boolean }) {
  const red = bad ? v : false;
  return (
    <div className={`rounded-lg border p-3 text-center ${red ? "border-danger/50 bg-danger/5" : "border-border bg-bg-elevated"}`}>
      <div className="text-xs uppercase text-fg-subtle">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${red ? "text-danger" : "text-success"}`}>{v ? "Yes" : "No"}</div>
    </div>
  );
}
