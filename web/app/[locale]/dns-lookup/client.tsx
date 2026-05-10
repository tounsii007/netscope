"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type DnsResult } from "@/lib/api";
import { LoadingButton, ResultCard } from "@/components/tool-shell";

const TYPES = ["A", "AAAA", "MX", "TXT", "CNAME", "NS", "SOA", "CAA"];

export function DnsClient() {
  const tc = useTranslations("common");
  const tn = useTranslations("nav.tools");
  const inputId = useId();
  const [domain, setDomain] = useState("example.com");
  const [selected, setSelected] = useState(new Set(["A", "AAAA", "MX", "TXT", "NS"]));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<DnsResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try {
      const types = Array.from(selected).join(",");
      setData(await api.dns(domain, types));
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  function toggle(tp: string) {
    const s = new Set(selected);
    if (s.has(tp)) s.delete(tp);
    else s.add(tp);
    setSelected(s);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-4" aria-label={tn("dns")}>
        <label htmlFor={inputId} className="sr-only">
          {tc("enter_domain")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={inputId}
            className="input"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.com"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
          <LoadingButton loading={loading} loadingLabel={tc("loading")}>
            {tc("lookup")}
          </LoadingButton>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="DNS record types">
          {TYPES.map((tp) => {
            const active = selected.has(tp);
            return (
              <button
                key={tp}
                type="button"
                onClick={() => toggle(tp)}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-1 text-xs font-mono transition ${
                  active
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border bg-bg-elevated text-fg-muted hover:border-fg-muted"
                }`}
              >
                {tp}
              </button>
            );
          })}
        </div>
      </form>

      {err && (
        <div className="card border-danger/50 text-danger" role="alert">
          {err}
        </div>
      )}

      {data && (
        <div className="space-y-3" aria-live="polite">
          <div className="text-xs text-fg-muted">{tc("resolved_in", { ms: data.durationMs })}</div>
          {Object.entries(data.records).map(([type, values]) => (
            <ResultCard key={type}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-mono text-sm font-semibold text-brand">{type}</h3>
                <span className="text-xs text-fg-muted">{tc("records_count", { count: values.length })}</span>
              </div>
              {values.length === 0 ? (
                <p className="text-sm text-fg-subtle">{tc("no_records")}</p>
              ) : (
                <ul className="space-y-1 font-mono text-sm">
                  {values.map((v, i) => (
                    <li key={i} className="rounded bg-bg-elevated px-3 py-1.5 break-all">{v}</li>
                  ))}
                </ul>
              )}
            </ResultCard>
          ))}
        </div>
      )}
    </div>
  );
}
