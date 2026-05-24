"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type IpResult } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";
import { SkeletonCard } from "@/components/skeleton";
import {
  MapPin, Monitor, ShieldAlert, Wifi,
  Check, X, RefreshCw,
} from "lucide-react";

export function DashboardClient() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [data, setData] = useState<IpResult | null>(null);
  const [screen, setScreen] = useState<string>("");
  const [tz, setTz] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // Single fetch helper so the Retry button can call it without
  // duplicating the timeout / error handling.
  const fetchIp = useCallback(() => {
    setLoading(true);
    setErr(null);
    // Bound the request so a wedged backend doesn't leave the user
    // staring at a spinner forever. 5 s is enough for the slowest
    // legitimate /me round-trip + ~2s GeoIP enrichment.
    const ac = new AbortController();
    const timeoutId = window.setTimeout(() => {
      ac.abort();
      setErr(tc("error_timeout"));
      setLoading(false);
    }, 5_000);

    api.me({ signal: ac.signal })
      .then((d) => {
        window.clearTimeout(timeoutId);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        window.clearTimeout(timeoutId);
        // Abort surface is the timeout we already handled — ignore.
        if ((e as Error)?.name === "AbortError") return;
        setErr(e instanceof Error ? e.message : "Error");
        setLoading(false);
      });

    return () => {
      window.clearTimeout(timeoutId);
      ac.abort();
    };
  }, [tc]);

  useEffect(() => {
    setScreen(`${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`);
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    return fetchIp();
    // attempt is in the deps so clicking Retry kicks a fresh request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (err) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger ring-1 ring-danger/20">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">{err}</p>
            <p className="mt-1 text-xs text-danger/80">{t("err_hint")}</p>
          </div>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="inline-flex items-center gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger transition hover:bg-danger/20"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {tc("retry")}
          </button>
        </div>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="space-y-3">
        <p
          className="inline-flex items-center gap-2 rounded-md border border-border bg-bg-elevated/70 px-3 py-1.5 text-xs text-fg-muted"
          role="status"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-60 animate-ping-slow preserve-motion" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          {t("detecting")}
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <SectionCard
        accent="brand"
        icon={<Wifi className="h-4 w-4" />}
        title={t("section_connection")}
      >
        <Row l={t("field_ip")} v={data.ip} mono />
        <Row l={t("field_hostname")} v={data.hostname} mono />
        <Row l={t("field_isp")} v={data.isp ?? data.org} />
        <Row l={t("field_asn")} v={data.asn} mono />
      </SectionCard>

      <SectionCard
        accent="cyan"
        icon={<MapPin className="h-4 w-4" />}
        title={t("section_location")}
      >
        <Row l={t("field_country")} v={data.country} />
        <Row l={t("field_region")} v={data.region} />
        <Row l={t("field_city")} v={data.city} />
        <Row l={t("field_tz_ip")} v={data.timezone} />
        <Row l={t("field_tz_browser")} v={tz} />
      </SectionCard>

      <SectionCard
        accent="violet"
        icon={<Monitor className="h-4 w-4" />}
        title={t("section_client")}
      >
        <Row l={t("field_browser")} v={data.client?.browser} />
        <Row l={t("field_os")} v={data.client?.os} />
        <Row l={t("field_device")} v={data.client?.device} />
        <Row l={t("field_screen")} v={screen} mono />
        <Row l={t("field_lang")} v={data.client?.acceptLanguage} mono />
      </SectionCard>

      {data.threat && (
        <SectionCard
          accent="success"
          icon={<ShieldAlert className="h-4 w-4" />}
          title={t("section_threat")}
          className="lg:col-span-3 xl:col-span-4"
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Pill label={t("threat_tor")} v={data.threat.tor} bad />
            <Pill label={t("threat_hosting")} v={data.threat.hosting} bad />
            <Pill label={t("threat_vpn")} v={data.threat.vpn} bad />
            <Pill label={t("threat_proxy")} v={data.threat.proxy} bad />
            <Pill label={t("threat_residential")} v={data.threat.residential} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

const ACCENT_TONE: Record<"brand" | "cyan" | "violet" | "success", string> = {
  brand:   "text-brand bg-brand/10 ring-brand/25",
  cyan:    "text-cyan-soft bg-cyan-brand/10 ring-cyan-brand/25",
  violet:  "text-violet-soft bg-violet-brand/10 ring-violet-brand/25",
  success: "text-success bg-success/10 ring-success/25",
};

function SectionCard({
  icon,
  title,
  accent,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  accent: "brand" | "cyan" | "violet" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ResultCard className={`relative overflow-hidden ${className ?? ""}`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${ACCENT_TONE[accent]}`}>
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </ResultCard>
  );
}

function Row({ l, v, mono }: { l: string; v?: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 py-1.5 last:border-0 text-sm">
      <span className="text-fg-muted">{l}</span>
      <span className={`truncate text-right text-fg ${mono ? "font-mono" : ""}`}>
        {v ?? <span className="text-fg-subtle">—</span>}
      </span>
    </div>
  );
}

function Pill({ label, v, bad }: { label: string; v: boolean; bad?: boolean }) {
  const flagged = bad ? v : false;
  const tone = flagged
    ? "border-danger/40 bg-danger/10 text-danger ring-danger/20"
    : "border-success/30 bg-success/10 text-success ring-success/20";
  const ValueIcon = v ? Check : X;
  return (
    <div
      className={`rounded-xl border ring-1 px-3 py-3 text-center transition hover:scale-[1.02] ${tone}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1.5 text-lg font-semibold">
        <ValueIcon className="h-4 w-4" aria-hidden="true" />
        <span>{v ? "Yes" : "No"}</span>
      </div>
    </div>
  );
}
