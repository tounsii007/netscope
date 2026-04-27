"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type OgResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { AlertTriangle } from "lucide-react";

export function OgClient() {
  const t = useTranslations("opengraph");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("https://github.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<OgResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.openGraph(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("preview")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          {/* Twitter/Facebook-style card preview */}
          <ResultCard className="overflow-hidden p-0">
            {data.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.image} alt="" className="h-64 w-full object-cover" />
            )}
            <div className="p-4">
              <div className="text-xs uppercase text-fg-subtle">{data.url}</div>
              <div className="mt-1 text-lg font-semibold">{data.title ?? t("no_title")}</div>
              <div className="mt-1 text-sm text-fg-muted line-clamp-2">{data.description ?? t("no_desc")}</div>
            </div>
          </ResultCard>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("field_site")} value={data.siteName} />
            <Field label={t("field_type")} value={data.type} />
            <Field label={t("field_twitter")} value={data.twitterCard} />
            <Field label={t("field_favicon")} value={data.favicon} mono />
          </div>

          {data.warnings.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">Findings</h3>
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-warn">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                  </li>
                ))}
              </ul>
            </ResultCard>
          )}

          <ResultCard>
            <h3 className="mb-2 text-sm font-semibold">{t("raw_tags")} ({Object.keys(data.allMeta).length})</h3>
            <pre className="max-h-80 overflow-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">
              {Object.entries(data.allMeta).map(([k, v]) => `${k}: ${v}`).join("\n")}
            </pre>
          </ResultCard>
        </>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs uppercase text-fg-subtle">{label}</div>
      <div className={`mt-1 truncate text-sm ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}
