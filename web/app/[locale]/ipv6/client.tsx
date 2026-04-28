"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { api, type Ipv6Result } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { normaliseHost } from "@/lib/normalise-host";
import { ScoreCard } from "@/app/[locale]/ipv6/score-card";
import { LayerGrid } from "@/app/[locale]/ipv6/layer-grid";
import {
  NxdomainNotice,
  looksUnresolved,
} from "@/app/[locale]/ipv6/nxdomain-notice";

/**
 * IPv6-readiness orchestrator. Owns the input + fetch state, then
 * delegates to the three view children:
 *   • ScoreCard      — the big number
 *   • LayerGrid      — six per-layer rows
 *   • NxdomainNotice — friendlier handling for non-existent domains
 *     (also exports the {@link looksUnresolved} heuristic).
 */
export function Ipv6Client() {
  const t = useTranslations("ipv6");
  const tc = useTranslations("common");

  const [domain, setDomain] = useState("google.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Ipv6Result | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = normaliseHost(domain);
    if (cleaned !== domain) setDomain(cleaned);
    if (!cleaned) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null);
    setLoading(true);
    setData(null);
    try {
      setData(await api.ipv6(cleaned));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const unresolved = data && looksUnresolved(data);

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card flex flex-col gap-2 sm:flex-row">
        <input
          className="input"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onBlur={(e) => setDomain(normaliseHost(e.target.value))}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="btn" disabled={loading}>
          {loading ? <Spinner /> : tc("score")}
        </button>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {unresolved && data && <NxdomainNotice data={data} />}

      {data && !unresolved && (
        <>
          <ScoreCard data={data} />
          <LayerGrid data={data} />

          {data.warnings.length > 0 && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("warnings")}</h3>
              <ul className="space-y-1 text-sm">
                {data.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-warn">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}
