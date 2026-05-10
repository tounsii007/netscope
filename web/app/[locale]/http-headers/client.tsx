"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type HeadersResult } from "@/lib/api";
import { LoadingButton, ResultCard } from "@/components/tool-shell";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { checkTargetGuard } from "@/lib/target-guard";

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-success", A: "text-success", B: "text-warn",
  C: "text-warn", D: "text-danger", F: "text-danger",
};

export function HeadersClient() {
  const t = useTranslations("headers");
  const tc = useTranslations("common");
  const tg = useTranslations("guard");
  const [url, setUrl] = useState("https://github.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<HeadersResult | null>(null);

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
    try { setData(await api.headers(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} noValidate className="card flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
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
        <LoadingButton loading={loading} loadingLabel={tc("loading")}>
          {tc("analyze")}
        </LoadingButton>
      </form>

      {err && <div className="card border-danger/50 text-danger" role="alert">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-6">
              <div className={`text-7xl font-bold leading-none ${GRADE_COLOR[data.grade] ?? ""}`}>
                {data.grade}
              </div>
              <div className="flex-1">
                <div className="font-mono text-sm text-fg-muted break-all">{data.url}</div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-elevated">
                  <div className="h-full bg-brand transition-all" style={{ width: `${data.score}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-fg-muted">
                  <span>{t("score", { score: data.score })}</span>
                  <span>{t("http_status", { status: data.status })}</span>
                </div>
              </div>
            </div>
          </ResultCard>

          <ResultCard>
            <h3 className="mb-4 text-sm font-semibold">{t("security_checks")}</h3>
            <ul className="space-y-2">
              {data.checks.map((c) => (
                <li key={c.header} className="rounded-lg border border-border bg-bg-elevated p-3">
                  <div className="flex items-start gap-3">
                    {c.good ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      : c.present ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                      : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <code className="text-sm font-semibold">{c.header}</code>
                        <span className="text-xs text-fg-subtle">+{c.weight}</span>
                      </div>
                      {c.value && <div className="mt-1 break-all font-mono text-xs text-fg-muted">{c.value}</div>}
                      {!c.good && <div className="mt-1 text-xs text-fg-muted">{c.detail}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ResultCard>

          {data.hsts && (
            <ResultCard>
              <h3 className="mb-3 text-sm font-semibold">{t("hsts_panel") || "HSTS policy"}</h3>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <Stat
                  label={t("hsts_max_age") || "max-age"}
                  value={data.hsts.maxAge >= 0 ? formatMaxAge(data.hsts.maxAge) : "—"}
                />
                <Stat
                  label="includeSubDomains"
                  value={data.hsts.includeSubDomains ? "✓" : "✗"}
                  ok={data.hsts.includeSubDomains}
                />
                <Stat
                  label="preload"
                  value={data.hsts.preload ? "✓" : "✗"}
                  ok={data.hsts.preload}
                />
                <Stat
                  label={t("hsts_preload_eligible") || "Preload-eligible"}
                  value={data.hsts.preloadEligible ? "✓" : "✗"}
                  ok={data.hsts.preloadEligible}
                />
              </div>
            </ResultCard>
          )}

          {data.csp && (
            <ResultCard>
              <h3 className="mb-3 text-sm font-semibold">{t("csp_panel") || "CSP audit"}</h3>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <Stat
                  label={t("csp_directives") || "Directives"}
                  value={String(data.csp.directiveCount)}
                />
                <Stat
                  label={"'unsafe-inline'"}
                  value={data.csp.hasUnsafeInline ? "⚠ present" : "✓ absent"}
                  ok={!data.csp.hasUnsafeInline}
                />
                <Stat
                  label={"'unsafe-eval'"}
                  value={data.csp.hasUnsafeEval ? "⚠ present" : "✓ absent"}
                  ok={!data.csp.hasUnsafeEval}
                />
                <Stat
                  label={t("csp_wildcard") || "Wildcard sources"}
                  value={data.csp.hasWildcard ? "⚠ present" : "✓ absent"}
                  ok={!data.csp.hasWildcard}
                />
              </div>
            </ResultCard>
          )}

          <ResultCard>
            <h3 className="mb-3 text-sm font-semibold">{t("raw_headers")}</h3>
            <pre className="max-h-80 overflow-auto rounded-lg bg-bg-elevated p-3 text-xs font-mono">
              {Object.entries(data.rawHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}
            </pre>
          </ResultCard>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  const color =
    ok === true ? "text-success" :
    ok === false ? "text-warn" :
    "text-fg";
  return (
    <div className="flex items-center justify-between rounded bg-bg-elevated px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
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
