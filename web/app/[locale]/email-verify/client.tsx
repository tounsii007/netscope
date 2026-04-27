"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type EmailVerifyResult } from "@/lib/api";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { CheckCircle2, XCircle } from "lucide-react";

export function EmailVerifyClient() {
  const t = useTranslations("email_verify");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("test@example.com");
  const [smtp, setSmtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<EmailVerifyResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.emailVerify(email, smtp)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="card space-y-3">
        <div className="flex gap-2">
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" disabled={loading}>{loading ? <Spinner /> : tc("verify")}</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={smtp} onChange={(e) => setSmtp(e.target.checked)} />
          {t("smtp_label")}
        </label>
      </form>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {data && (
        <>
          <ResultCard>
            <div className="flex items-center gap-4">
              <div className="text-6xl font-bold" style={{ color: data.deliverable ? "#10b981" : "#ef4444" }}>
                {data.score}
              </div>
              <div>
                <div className="text-lg">{data.deliverable ? t("deliverable") : t("problematic")}</div>
                <div className="text-sm font-mono text-fg-muted">{data.email}</div>
              </div>
            </div>
          </ResultCard>

          <div className="grid gap-4 md:grid-cols-2">
            <Flag label={t("flag_syntax")} v={data.syntaxValid} />
            <Flag label={t("flag_mx")} v={data.hasMx} />
            <Flag label={t("flag_not_disposable")} v={!data.disposable} />
            <Flag label={t("flag_not_role")} v={!data.role} />
          </div>

          <ResultCard>
            <h3 className="mb-2 text-sm font-semibold">{t("mx_records")}</h3>
            {data.mx.length === 0
              ? <p className="text-sm text-fg-subtle">{t("no_mx")}</p>
              : <ul className="space-y-1 font-mono text-sm">
                  {data.mx.map((m) => <li key={m} className="rounded bg-bg-elevated px-3 py-1.5">{m}</li>)}
                </ul>}
          </ResultCard>

          {data.smtp && (
            <ResultCard>
              <h3 className="mb-2 text-sm font-semibold">{t("smtp_probe")}</h3>
              <div className="font-mono text-sm">{t("smtp_mx")}: {data.smtp.mx}</div>
              <div className="font-mono text-sm">
                {t("smtp_code")}: <span className={data.smtp.accepted ? "text-success" : "text-danger"}>{data.smtp.code ?? "—"}</span>
              </div>
              {data.smtp.error && <div className="text-sm text-danger">{data.smtp.error}</div>}
            </ResultCard>
          )}
        </>
      )}
    </div>
  );
}

function Flag({ label, v }: { label: string; v: boolean }) {
  return (
    <div className="card flex items-center gap-3">
      {v ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-danger" />}
      <span>{label}</span>
    </div>
  );
}
