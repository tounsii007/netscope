"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type PortCheckResult, type PortScanResult } from "@/lib/api";
import { Spinner } from "@/components/tool-shell";
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

  const [mode, setMode] = useState<Mode>("single");
  const [target, setTarget] = useState("google.com");
  const [port, setPort] = useState(443);
  const [fromPort, setFromPort] = useState(20);
  const [toPort, setToPort] = useState(100);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [single, setSingle] = useState<PortCheckResult | null>(null);
  const [scan, setScan] = useState<PortScanResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim()) {
      setErr(tc("input_required"));
      setSingle(null);
      setScan(null);
      return;
    }
    setErr(null);
    setLoading(true);
    setSingle(null);
    setScan(null);
    try {
      if (mode === "single") {
        setSingle(await api.portCheck(target, port));
      } else if (mode === "common") {
        setScan(await api.portScan(target, { commonOnly: true }));
      } else {
        setScan(await api.portScan(target, { fromPort, toPort }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-4">
        <ModeTabs mode={mode} onChange={setMode} />

        <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
          <input
            className="input"
            placeholder={t("placeholder_host")}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          {mode === "single" && (
            <input
              type="number"
              min={1}
              max={65535}
              className="input"
              value={port}
              onChange={(e) => setPort(+e.target.value)}
              required
            />
          )}
          {mode === "range" && (
            <div className="flex gap-2">
              <input
                type="number"
                className="input"
                value={fromPort}
                onChange={(e) => setFromPort(+e.target.value)}
              />
              <input
                type="number"
                className="input"
                value={toPort}
                onChange={(e) => setToPort(+e.target.value)}
              />
            </div>
          )}
          {mode === "common" && (
            <div className="text-sm text-fg-muted self-center">
              {t("common_count", { count: 20 })}
            </div>
          )}
          <button className="btn" disabled={loading}>
            {loading ? <Spinner /> : tc("check")}
          </button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {single && <SinglePortResult result={single} />}
      {scan && <ScanResult result={scan} />}
    </div>
  );
}
