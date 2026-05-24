"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type PortCheckResult, type PortScanResult } from "@/lib/api";
import { LoadingButton } from "@/components/tool-shell";
import { SkeletonCard } from "@/components/skeleton";
import { RecentTargets } from "@/components/recent-targets";
import { ShareLink } from "@/components/share-link";
import { useRecentTargets } from "@/lib/use-recent-targets";
import { useDeepLink } from "@/lib/use-deep-link";
import { checkTargetGuard } from "@/lib/target-guard";
import { ModeTabs, type Mode } from "@/app/[locale]/port-checker/mode-tabs";
import { SinglePortResult } from "@/app/[locale]/port-checker/single-result";
import { ScanResult } from "@/app/[locale]/port-checker/scan-result";

/**
 * Port-checker orchestrator. Owns the input + mode state and the
 * branching network call (single port vs common-only vs custom range);
 * everything visual is delegated to mode-tabs, single-result and
 * scan-result.
 */
export function PortCheckerClient() {
  const t = useTranslations("ports");
  const tc = useTranslations("common");
  const tg = useTranslations("guard");
  const tn = useTranslations("nav.tools");
  const hostId = useId();
  const portId = useId();
  const fromId = useId();
  const toId = useId();

  const [mode, setMode] = useState<Mode>("single");
  const [target, setTarget] = useState("google.com");
  const [port, setPort] = useState(443);
  const [fromPort, setFromPort] = useState(20);
  const [toPort, setToPort] = useState(100);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [single, setSingle] = useState<PortCheckResult | null>(null);
  const [scan, setScan] = useState<PortScanResult | null>(null);

  // Persisted last-5 host strings across reloads. Slug is hand-picked
  // so this stays stable even if the URL slug changes one day.
  const { recent, remember, forget } = useRecentTargets("port-checker");

  // ?target= deep-link: prefill the input on landing AND auto-submit
  // so a shared URL lands the recipient on the results page.
  // buildUrl is pure (used for Share); pushUrl writes the URL after
  // a successful submit so the back button isn't trapped per
  // keystroke.
  const { buildUrl, pushUrl } = useDeepLink({
    setTarget,
    onAutoRun: () => {
      // Synthesize a submit so the validate/abort/fetch path runs.
      run({ preventDefault: () => {} } as unknown as React.FormEvent);
    },
  });

  // Tracks the in-flight scan so a fresh submit can cancel a slow one.
  // Without this, a user typing then hitting enter, editing, hitting
  // enter again can land the older response after the newer one and
  // overwrite the correct state.
  const inFlight = useRef<AbortController | null>(null);
  // Cancel any in-flight scan when the component unmounts (e.g. nav).
  useEffect(() => () => inFlight.current?.abort(), []);

  function validateBeforeRun(): string | null {
    if (!target.trim()) return tc("input_required");
    // Localhost / private / metadata targets are blocked here, before
    // we hit the API. The backend re-runs the same check (TargetValidator)
    // — this is purely defense-in-depth + better error UX.
    const guard = checkTargetGuard(target);
    if (!guard.ok) return tg(guard.reasonKey);
    if (mode === "single" && (port < 1 || port > 65535)) {
      return t("invalid_port");
    }
    if (mode === "range") {
      if (fromPort < 1 || toPort > 65535 || fromPort > toPort) return t("invalid_range");
      // Cap range size client-side so users don't fire 60 000 RPCs by accident.
      if (toPort - fromPort > 1024) return t("range_too_wide");
    }
    return null;
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const v = validateBeforeRun();
    if (v) {
      setErr(v);
      setSingle(null);
      setScan(null);
      return;
    }
    // Cancel any previous in-flight scan so its (now-stale) response
    // can't overwrite the result of THIS submit.
    inFlight.current?.abort();
    const ac = new AbortController();
    inFlight.current = ac;

    setErr(null);
    setLoading(true);
    setSingle(null);
    setScan(null);
    try {
      if (mode === "single") {
        setSingle(await api.portCheck(target, port, { signal: ac.signal }));
      } else if (mode === "common") {
        setScan(await api.portScan(target, { commonOnly: true }, { signal: ac.signal }));
      } else {
        setScan(await api.portScan(target, { fromPort, toPort }, { signal: ac.signal }));
      }
      // Save the host only when the lookup actually returned a value.
      // Aborted / failed requests don't pollute the history.
      remember(target);
      // Sync the URL so the user can share / bookmark the result.
      pushUrl(target);
    } catch (e) {
      // AbortError means a fresher submit superseded this one — silent.
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
      <form onSubmit={run} noValidate className="card space-y-4" aria-label={tn("ports")}>
        <ModeTabs mode={mode} onChange={setMode} />

        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <div>
            <label htmlFor={hostId} className="sr-only">{tc("enter_host")}</label>
            <input
              id={hostId}
              className="input"
              placeholder={t("placeholder_host")}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
            />
          </div>
          {mode === "single" && (
            <div>
              <label htmlFor={portId} className="sr-only">Port</label>
              <input
                id={portId}
                type="number"
                min={1}
                max={65535}
                className="input"
                value={port}
                onChange={(e) => setPort(+e.target.value)}
                required
                inputMode="numeric"
              />
            </div>
          )}
          {mode === "range" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor={fromId} className="sr-only">{t("from_port") || "From port"}</label>
                <input
                  id={fromId}
                  type="number"
                  min={1}
                  max={65535}
                  className="input"
                  value={fromPort}
                  onChange={(e) => setFromPort(+e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="flex-1">
                <label htmlFor={toId} className="sr-only">{t("to_port") || "To port"}</label>
                <input
                  id={toId}
                  type="number"
                  min={1}
                  max={65535}
                  className="input"
                  value={toPort}
                  onChange={(e) => setToPort(+e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
          )}
          {mode === "common" && (
            <div className="text-sm text-fg-muted self-center">
              {t("common_count", { count: 20 })}
            </div>
          )}
          <LoadingButton loading={loading} loadingLabel={tc("loading")}>
            {tc("check")}
          </LoadingButton>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RecentTargets recent={recent} onPick={setTarget} onForget={forget} />
          <ShareLink url={buildUrl(target)} />
        </div>
      </form>

      {err && (
        <div
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20"
          role="alert"
        >
          <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
          <span>{err}</span>
        </div>
      )}

      <div aria-live="polite">
        {/*
          Skeleton placeholder while the first probe runs. We render
          ONLY when no result is yet present — subsequent re-submits
          keep the previous result on screen so the user has visual
          continuity instead of a flash of empty.
        */}
        {loading && !single && !scan && <SkeletonCard />}
        {single && <SinglePortResult result={single} />}
        {scan && <ScanResult result={scan} />}
      </div>
    </div>
  );
}
