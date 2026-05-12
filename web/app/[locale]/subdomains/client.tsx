"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { api, type SubdomainsResult } from "@/lib/api";
import { normaliseRegistrableDomain } from "@/lib/normalise-host";
import { ResultCard } from "@/components/tool-shell";
import { SubdomainsForm } from "./subdomains-form";
import { StatsHeader } from "./stats-header";
import { SubdomainsList } from "./subdomains-list";

/**
 * Subdomain Finder — orchestrator only.
 *
 * Decomposed into:
 *   • subdomains-form.tsx       — input + submit
 *   • stats-header.tsx          — count, filter, copy-all, export menu
 *   • export-menu.tsx           — txt/csv/json dropdown
 *   • export-helpers.ts         — pure download functions
 *   • subdomains-list.tsx       — scrollable list + per-row actions
 *   • highlight.tsx             — filter-match highlighting helper
 *
 * This file owns the network call and the cross-cutting pieces of state
 * (domain input, fetch result, filter) that multiple children depend on.
 * Every other concern lives in its own focused file.
 */
export function SubdomainsClient() {
  const t = useTranslations("subdomains");
  const tc = useTranslations("common");

  const [domain, setDomain] = useState("github.com");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SubdomainsResult | null>(null);

  // Live-normalise so the user can preview what we'll actually query.
  const normalisedDomain = useMemo(
    () => normaliseRegistrableDomain(domain),
    [domain]
  );

  const filtered = useMemo(
    () =>
      data
        ? data.subdomains.filter((s) =>
            s.toLowerCase().includes(filter.trim().toLowerCase())
          )
        : [],
    [data, filter]
  );

  // Per-depth distribution (apex.example.com → 0, foo.bar.example.com → 1)
  // for the at-a-glance distribution badges in the header.
  const depthDistribution = useMemo(() => {
    if (!data || data.subdomains.length === 0) return null;
    const map = new Map<number, number>();
    const baseDepth = data.domain.split(".").length;
    for (const s of data.subdomains) {
      const depth = s.split(".").length - baseDepth;
      map.set(depth, (map.get(depth) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [data]);

  // Subdomain enumeration hits crt.sh / CertSpotter, both routinely
  // taking 5-30 s. User pattern is to edit + re-submit fast; without
  // an AbortController, a slow EARLIER response can land AFTER a
  // faster later one and overwrite correct state with stale data.
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const target = normalisedDomain;
    if (!target) {
      setErr(tc("input_required"));
      setData(null);
      setFilter("");
      return;
    }
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;

    setErr(null);
    setLoading(true);
    setData(null);
    setFilter("");
    try {
      setData(await api.subdomains(target, { signal: ac.signal }));
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      if (inFlight.current === ac) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="space-y-6">
      <SubdomainsForm
        domain={domain}
        onDomainChange={setDomain}
        normalisedDomain={normalisedDomain}
        loading={loading}
        onSubmit={run}
      />

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && data.degraded && (
        <div className="card border-warn/50 bg-warn/5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-warn">{t("degraded_title")}</div>
            <div className="mt-1 text-fg-muted">
              {data.message ?? t("degraded_message")}
            </div>
          </div>
        </div>
      )}

      {data && !data.degraded && (
        <ResultCard>
          <StatsHeader
            data={data}
            filter={filter}
            onFilterChange={setFilter}
            filteredCount={filtered.length}
            depthDistribution={depthDistribution}
          />
          <SubdomainsList
            filter={filter}
            onClearFilter={() => setFilter("")}
            filtered={filtered}
            totalCount={data.count}
          />
        </ResultCard>
      )}
    </div>
  );
}
