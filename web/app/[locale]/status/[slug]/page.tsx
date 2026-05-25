import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, getFormatter } from "next-intl/server";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, ServerCog,
  Sparkles, ShieldAlert,
} from "lucide-react";

interface PublicStatus {
  name: string; description?: string; logo?: string; brandColor?: string;
  overallStatus: string;
  incidents: Array<{ id: string; title: string; status: string; impact: string;
    body: string; startedAt: string; resolvedAt?: string }>;
  monitors: Array<{ name: string; up: boolean; uptime24h: number }>;
}

async function fetchStatus(slug: string): Promise<PublicStatus | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
  try {
    const res = await fetch(`${base}/api/v1/status-pages/public/${encodeURIComponent(slug)}`,
      { next: { revalidate: 30 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicStatus;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations("status");
  const data = await fetchStatus(slug);
  return {
    title: data ? t("meta_title_with_name", { name: data.name }) : t("meta_title_fallback"),
    description: data?.description ?? t("meta_description_fallback"),
  };
}

const STATUS_TONE: Record<
  string,
  { dot: string; ring: string; text: string; bg: string; orb: string }
> = {
  OPERATIONAL: {
    dot:  "bg-success",
    ring: "ring-success/30",
    text: "text-success",
    bg:   "bg-success/10",
    orb:  "bg-success",
  },
  MINOR: {
    dot:  "bg-warn",
    ring: "ring-warn/30",
    text: "text-warn",
    bg:   "bg-warn/10",
    orb:  "bg-warn",
  },
  MAJOR: {
    dot:  "bg-danger",
    ring: "ring-danger/30",
    text: "text-danger",
    bg:   "bg-danger/10",
    orb:  "bg-danger",
  },
  CRITICAL: {
    dot:  "bg-danger",
    ring: "ring-danger/30",
    text: "text-danger",
    bg:   "bg-danger/10",
    orb:  "bg-danger",
  },
};

export default async function StatusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations("status");
  const format = await getFormatter();
  const data = await fetchStatus(slug);
  if (!data) notFound();

  const operational = data.overallStatus === "OPERATIONAL";
  const tone = STATUS_TONE[data.overallStatus] ?? STATUS_TONE.MINOR;

  return (
    <div className="mx-auto max-w-3xl py-10 sm:py-12 space-y-8">
      {/* Page header */}
      <header className="flex items-center gap-4">
        {data.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.logo}
            alt=""
            className="h-12 w-12 rounded-xl ring-1 ring-border"
            aria-hidden="true"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/25">
            <ServerCog className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
            {data.name}
          </h1>
          {data.description && (
            <p className="mt-1 text-sm text-fg-muted">{data.description}</p>
          )}
        </div>
      </header>

      {/* Hero status card — glowing surface tinted by the overall state */}
      <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-bg-card">
        <div aria-hidden="true" className="absolute inset-0 bg-mesh-2 opacity-25" />
        <div
          aria-hidden="true"
          className={`orb h-44 w-44 -top-10 -left-10 opacity-40 ${tone.orb}`}
        />
        <div className="relative flex items-center justify-between gap-4 px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-4">
            <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${tone.ring} ${tone.bg}`}>
              {operational ? (
                <CheckCircle2 className={`h-6 w-6 ${tone.text}`} aria-hidden="true" />
              ) : (
                <AlertTriangle className={`h-6 w-6 ${tone.text}`} aria-hidden="true" />
              )}
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-xl ring-1 ${tone.ring} animate-ping-slow preserve-motion`}
              />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full ${tone.dot} opacity-60 animate-ping-slow preserve-motion`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`} />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                  {data.overallStatus}
                </span>
              </div>
              <p className={`mt-1 text-base font-semibold sm:text-lg ${operational ? "text-fg" : tone.text}`}>
                {operational
                  ? t("overall_operational")
                  : t("overall_degraded", { status: data.overallStatus })}
              </p>
            </div>
          </div>
          <Sparkles className="hidden h-6 w-6 text-brand/60 sm:block" aria-hidden="true" />
        </div>
      </div>

      {/* Services */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
          <Activity className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          {t("section_services")}
        </h2>
        <div className="space-y-2">
          {data.monitors.length === 0 && (
            <div className="card text-sm text-fg-muted">{t("no_services")}</div>
          )}
          {data.monitors.map((m) => (
            <div
              key={m.name}
              className="flex items-center justify-between rounded-xl border border-border bg-bg-card/70 px-4 py-3 transition hover:border-fg-muted"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex h-2.5 w-2.5 rounded-full ring-2 ${
                    m.up
                      ? "bg-success ring-success/20"
                      : "bg-danger ring-danger/20"
                  }`}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium text-fg">{m.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-medium ${
                    m.up ? "text-success" : "text-danger"
                  }`}
                >
                  {m.up ? t("monitor_operational") : t("monitor_down")}
                </span>
                <span className="rounded-md bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted ring-1 ring-border">
                  {t("uptime_24h", { value: m.uptime24h.toFixed(2) })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Incidents */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
          <ShieldAlert className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
          {t("section_incidents")}
        </h2>
        {data.incidents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-bg-card/40 px-6 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-fg">{t("no_incidents")}</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {data.incidents.map((i) => {
              const resolved = i.status === "RESOLVED";
              return (
                <li
                  key={i.id}
                  className={`rounded-xl border bg-bg-card/70 p-4 sm:p-5 ${
                    resolved ? "border-border" : "border-warn/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-fg">{i.title}</h3>
                      <time className="mt-0.5 inline-flex items-center gap-1 text-xs text-fg-muted">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {format.dateTime(new Date(i.startedAt), { dateStyle: "medium", timeStyle: "short" })}
                      </time>
                    </div>
                    <span
                      className={`badge ${
                        resolved ? "bg-success/15 text-success" : "bg-warn/15 text-warn"
                      }`}
                    >
                      {resolved ? t("incident_resolved") : i.status}
                    </span>
                  </div>
                  {i.body && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-fg-muted">{i.body}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
