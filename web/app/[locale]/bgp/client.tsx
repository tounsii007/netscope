"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type BgpIpResult, type BgpAsnResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";

export function BgpClient() {
  const t = useTranslations("bgp");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"ip" | "asn">("ip");
  const [value, setValue] = useState("1.1.1.1");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ip, setIp] = useState<BgpIpResult | null>(null);
  const [asn, setAsn] = useState<BgpAsnResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true); setIp(null); setAsn(null);
    try {
      if (mode === "ip") setIp(await api.bgpIp(value));
      else setAsn(await api.bgpAsn(value));
    } catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="flex gap-1 rounded-lg bg-bg-elevated p-1">
          {(["ip", "asn"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setValue(m === "ip" ? "1.1.1.1" : "AS13335"); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm uppercase transition ${
                mode === m ? "bg-brand text-white" : "text-fg-muted hover:text-fg"
              }`}>{m}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} required />
          <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("lookup")}</button>
        </div>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {ip && (
        <>
          <ResultCard>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("field_ip")} value={ip.ip} mono />
              <Field label={t("field_prefix")} value={ip.prefix} mono />
              <Field label={t("field_block")} value={ip.block} mono />
              <Field label={t("field_announced")} value={ip.announced ? tc("yes") : tc("no")} />
              <Field label={t("field_country")} value={ip.geo?.country} />
              <Field label={t("field_city")} value={ip.geo?.city} />
            </div>
          </ResultCard>
          <ResultCard>
            <h3 className="mb-2 text-sm font-semibold">{t("announcing_asns")}</h3>
            <ul className="space-y-1 text-sm">
              {ip.asns.map((a) => (
                <li key={a.asn} className="flex justify-between rounded bg-bg-elevated px-3 py-1.5">
                  <span className="font-mono">{a.asn}</span>
                  <span className="text-fg-muted">{a.holder}</span>
                </li>
              ))}
            </ul>
          </ResultCard>
        </>
      )}

      {asn && (
        <>
          <ResultCard>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("field_asn")} value={asn.asn} mono />
              <Field label={t("field_holder")} value={asn.holder} />
              <Field label={t("field_announced_prefixes")} value={String(asn.announcedPrefixes)} />
              <Field label={t("field_neighbours")} value={String(asn.neighbourCount)} />
            </div>
          </ResultCard>
          <ResultCard>
            <h3 className="mb-2 text-sm font-semibold">{t("prefix_sample")}</h3>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3 md:grid-cols-4">
              {asn.prefixSample.map((p) => (
                <div key={p} className="rounded bg-bg-elevated px-2 py-1 break-all">{p}</div>
              ))}
            </div>
          </ResultCard>
        </>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-fg-subtle">{label}</div>
      <div className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}
