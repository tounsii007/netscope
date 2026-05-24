"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type HeadersResult } from "@/lib/api";
import { LoadingButton, ResultCard } from "@/components/tool-shell";
import { SkeletonCard } from "@/components/skeleton";
import { ShareLink } from "@/components/share-link";
import { useDeepLink } from "@/lib/use-deep-link";
import {
  CheckCircle2, AlertCircle, XCircle, Link as LinkIcon,
  Shield, Code2, FileCode,
} from "lucide-react";
import { checkTargetGuard } from "@/lib/target-guard";

const GRADE_TONE: Record<
  string,
  { text: string; ring: string; bg: string; bar: string }
> = {
  "A+": { text: "text-success", ring: "ring-success/40", bg: "bg-success/10", bar: "bg-success" },
  A:    { text: "text-success", ring: "ring-success/40", bg: "bg-success/10", bar: "bg-success" },
  B:    { text: "text-warn",    ring: "ring-warn/40",    bg: "bg-warn/10",    bar: "bg-warn"    },
  C:    { text: "text-warn",    ring: "ring-warn/40",    bg: "bg-warn/10",    bar: "bg-warn"    },
  D:    { text: "text-danger",  ring: "ring-danger/40",  bg: "bg-danger/10",  bar: "bg-danger"  },
  F:    { text: "text-danger",  ring: "ring-danger/40",  bg: "bg-danger/10",  bar: "bg-danger"  },
};

export function HeadersClient() {
  const t = useTranslations("headers");
  const tc = useTranslations("common");
  const tg = useTranslations("guard");
  const [url, setUrl] = useState("https://github.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<HeadersResult | null>(null);
  const { buildUrl, pushUrl } = useDeepLink({
    setTarget: setUrl,
    onAutoRun: () => { run({ preventDefault: () => {} } as unknown as React.FormEvent); },
  });

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    const guard = checkTargetGuard(url);
    if (!guard.ok) {
      setErr(tg(guard.reasonKey));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try {
      setData(await api.headers(url));
      pushUrl(url);
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={run}
        noValidate
        className="card space-y-3"
      >
       <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <LinkIcon
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
            aria-hidden="true"
          />
          <input
            className="input pl-11"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tc("enter_url")}
            aria-label={tc("enter_url")}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
        </div>
        <LoadingButton loading={loading} loadingLabel={tc("loading")}>
          {tc("analyze")}
        </LoadingButton>
       </div>
        <div className="flex justify-end">
          <ShareLink url={buildUrl(url)} />
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

      {loading && !data && <SkeletonCard count={2} />}

      {data && (
        <div className="space-y-4" aria-live="polite">
          {/* Grade hero */}
          {(() => {
            const tone = GRADE_TONE[data.grade] ?? GRADE_TONE.C;
            return (
              <ResultCard className="relative overflow-hidden">
                <div className="flex items-center gap-6">
                  <div
                    className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl ring-2 ${tone.ring} ${tone.bg}`}
                  >
                    <span className={`text-5xl font-bold leading-none ${tone.text}`}>
                      {data.grade}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2 py-1 text-xs">
                      <LinkIcon className="h-3 w-3 text-cyan-soft" aria-hidden="true" />
                      <span className="break-all font-mono text-fg">{data.url}</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-elevated ring-1 ring-border">
                      <div
                        className={`h-full ${tone.bar} transition-all duration-700 ease-out`}
                        style={{ width: `${data.score}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs">
                      <span className={`font-mono font-semibold ${tone.text}`}>
                        {t("score", { score: data.score })}
                      </span>
                      <span className="rounded-md bg-bg-elevated px-2 py-0.5 font-mono text-fg-muted ring-1 ring-border">
                        {t("http_status", { status: data.status })}
                      </span>
                    </div>
                  </div>
                </div>
              </ResultCard>
            );
          })()}

          {/* Security checks */}
          <ResultCard>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("security_checks")}
            </h3>
            <ul className="space-y-2">
              {data.checks.map((c) => {
                const tone = c.good
                  ? "border-success/30 bg-success/5"
                  : c.present
                    ? "border-warn/30 bg-warn/5"
                    : "border-danger/30 bg-danger/5";
                return (
                  <li
                    key={c.header}
                    className={`rounded-xl border ${tone} p-3`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0">
                        {c.good ? (
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                        ) : c.present ? (
                          <AlertCircle className="h-4 w-4 text-warn" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <code className="text-sm font-semibold text-fg">{c.header}</code>
                          <span className="shrink-0 rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-muted ring-1 ring-border">
                            +{c.weight}
                          </span>
                        </div>
                        {c.value && (
                          <div className="mt-1.5 break-all rounded-md bg-bg-elevated/60 px-2 py-1 font-mono text-[11px] text-fg-muted">
                            {c.value}
                          </div>
                        )}
                        {!c.good && c.detail && (
                          <div className="mt-1.5 text-xs text-fg-muted">{c.detail}</div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ResultCard>

          {data.hsts && (
            <ResultCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {t("hsts_panel") || "HSTS policy"}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <Stat
                  label={t("hsts_max_age") || "max-age"}
                  value={data.hsts.maxAge >= 0 ? formatMaxAge(data.hsts.maxAge) : "—"}
                />
                <Stat
                  label="includeSubDomains"
                  value={data.hsts.includeSubDomains ? "yes" : "no"}
                  ok={data.hsts.includeSubDomains}
                />
                <Stat
                  label="preload"
                  value={data.hsts.preload ? "yes" : "no"}
                  ok={data.hsts.preload}
                />
                <Stat
                  label={t("hsts_preload_eligible") || "Preload-eligible"}
                  value={data.hsts.preloadEligible ? "yes" : "no"}
                  ok={data.hsts.preloadEligible}
                />
              </div>
            </ResultCard>
          )}

          {data.csp && (
            <ResultCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {t("csp_panel") || "CSP audit"}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <Stat
                  label={t("csp_directives") || "Directives"}
                  value={String(data.csp.directiveCount)}
                />
                <Stat
                  label={"'unsafe-inline'"}
                  value={data.csp.hasUnsafeInline ? "present" : "absent"}
                  ok={!data.csp.hasUnsafeInline}
                />
                <Stat
                  label={"'unsafe-eval'"}
                  value={data.csp.hasUnsafeEval ? "present" : "absent"}
                  ok={!data.csp.hasUnsafeEval}
                />
                <Stat
                  label={t("csp_wildcard") || "Wildcard sources"}
                  value={data.csp.hasWildcard ? "present" : "absent"}
                  ok={!data.csp.hasWildcard}
                />
              </div>
            </ResultCard>
          )}

          <ResultCard>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-brand/10 text-cyan-soft ring-1 ring-cyan-brand/25">
                <FileCode className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {t("raw_headers")}
            </h3>
            <pre className="max-h-80 overflow-auto rounded-xl border border-border bg-bg-elevated/60 p-3 font-mono text-xs leading-relaxed text-fg-muted">
              {Object.entries(data.rawHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}
            </pre>
          </ResultCard>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  const tone =
    ok === true
      ? "bg-success/10 ring-success/25 text-success"
      : ok === false
        ? "bg-warn/10 ring-warn/25 text-warn"
        : "bg-bg-elevated ring-border text-fg";
  const icon =
    ok === true ? (
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
    ) : ok === false ? (
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
    ) : null;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg ring-1 px-3 py-2 ${tone}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </span>
      <span className="inline-flex items-center gap-1 font-mono text-sm">
        {icon}
        {value}
      </span>
    </div>
  );
}

/**
 * Render an HSTS max-age in human-readable form alongside the raw
 * seconds count: "31536000 (1 year)".
 */
function formatMaxAge(seconds: number): string {
  const human =
    seconds >= 31_536_000 ? `${Math.round(seconds / 31_536_000)} year${seconds >= 63_072_000 ? "s" : ""}` :
    seconds >= 86_400      ? `${Math.round(seconds / 86_400)} day${seconds >= 172_800 ? "s" : ""}` :
    seconds >= 3_600       ? `${Math.round(seconds / 3_600)} h` :
    `${seconds} s`;
  return `${seconds} (${human})`;
}
