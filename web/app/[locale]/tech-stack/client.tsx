"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type TechResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { AlertTriangle } from "lucide-react";
import { normaliseHost } from "@/lib/normalise-host";

export function TechClient() {
  const t = useTranslations("tech");
  const tc = useTranslations("common");
  const [host, setHost] = useState("vercel.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TechResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    // Backend's regex on /api/v1/tech/{host} accepts hostnames only, no schemes
    // and no paths. Users routinely paste full URLs ("https://www.bahnhof.de"
    // or "https://example.com/foo/bar") so we strip them down to the bare
    // hostname before sending — and reflect the cleaned value in the input.
    const cleaned = normaliseHost(host);
    if (cleaned !== host) setHost(cleaned);
    if (!cleaned) { setErr(tc("error")); return; }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.tech(cleaned)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={host} onChange={(e) => setHost(e.target.value)} required />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("detect")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="text-3xl font-semibold">{data.totalDetected}</div>
            <div className="text-sm text-fg-muted">
              {t("detected", { count: data.totalDetected })}
              {data.status ? ` · HTTP ${data.status}` : ""}
            </div>

            {/* When zero results it's almost always a bot-protection scenario:
                LinkedIn / Facebook / banking sites return a minimal challenge
                page that doesn't trigger any fingerprint rules. Without this
                explanation the user thinks the tool is broken. */}
            {data.totalDetected === 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/5 p-4">
                <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium text-warn">{t("empty_title")}</div>
                  <div className="mt-1 text-fg-muted">{t("empty_reasons")}</div>
                </div>
              </div>
            )}
          </ResultCard>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(data.technologies).map(([cat, techs]) => (
              <ResultCard key={cat}>
                <h3 className="mb-2 text-xs font-semibold uppercase text-fg-subtle">{cat}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {techs.map((tp) => (
                    <span key={tp} className="badge bg-brand/10 text-brand">{tp}</span>
                  ))}
                </div>
              </ResultCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
