"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type SubdomainsResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { Download, Search } from "lucide-react";

export function SubdomainsClient() {
  const t = useTranslations("subdomains");
  const tc = useTranslations("common");
  const [domain, setDomain] = useState("github.com");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SubdomainsResult | null>(null);

  const filtered = useMemo(
    () => data ? data.subdomains.filter((s) => s.includes(filter.toLowerCase())) : [],
    [data, filter]
  );

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true); setData(null); setFilter("");
    try { setData(await api.subdomains(domain)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  function download() {
    if (!data) return;
    const blob = new Blob([data.subdomains.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.domain}-subdomains.txt`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex gap-2">
        <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} required />
        <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("enumerate")}</button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <ResultCard>
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-2xl font-semibold">{data.count.toLocaleString()}</div>
              <div className="text-xs text-fg-muted">{t("count", { count: data.count })} · {data.durationMs}ms · {data.source}</div>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
                <input className="input pl-8" placeholder={t("filter_placeholder")}
                  value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <button type="button" onClick={download} className="btn-ghost">
                <Download className="h-4 w-4" /> .txt
              </button>
            </div>
          </div>

          <div className="max-h-[500px] overflow-auto rounded-lg border border-border">
            <ul className="divide-y divide-border/40 font-mono text-sm">
              {filtered.map((s) => (
                <li key={s} className="flex items-center justify-between px-3 py-1.5 hover:bg-bg-elevated">
                  <span className="break-all">{s}</span>
                  <a href={`/ip-lookup?host=${s}`} className="text-xs text-fg-subtle hover:text-brand">lookup →</a>
                </li>
              ))}
              {filtered.length === 0 && <li className="p-6 text-center text-fg-subtle text-sm">{tc("no_results")}</li>}
            </ul>
          </div>
        </ResultCard>
      )}
    </div>
  );
}
