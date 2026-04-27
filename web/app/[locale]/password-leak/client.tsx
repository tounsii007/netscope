"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ResultCard, Spinner } from "@/components/tool-shell";
import { Eye, EyeOff, Lock, ShieldAlert, ShieldCheck } from "lucide-react";

async function sha1(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function PasswordLeakClient() {
  const t = useTranslations("password");
  const tc = useTranslations("common");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!pwd.trim()) {
      setErr(tc("input_required"));
      setCount(null);
      return;
    }
    setLoading(true); setErr(null); setCount(null);
    try {
      const hash = await sha1(pwd);
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
      });
      if (!res.ok) throw new Error(`HIBP returned ${res.status}`);
      const text = await res.text();
      let found = 0;
      for (const line of text.split("\n")) {
        const [suf, c] = line.trim().split(":");
        if (suf === suffix) { found = parseInt(c, 10); break; }
      }
      setCount(found);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <ResultCard>
        <div className="mb-3 flex items-center gap-2 text-xs text-fg-muted">
          <Lock className="h-3.5 w-3.5" />
          {t("privacy_note")}
        </div>
        <form onSubmit={check} className="flex gap-2">
          <div className="relative flex-1">
            <input type={show ? "text" : "password"} className="input pr-10"
              value={pwd} onChange={(e) => setPwd(e.target.value)}
              autoComplete="new-password" placeholder={t("placeholder")} />
            <button type="button" onClick={() => setShow(!show)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button className="btn" disabled={loading || !pwd}>{loading ? <Spinner /> : tc("check")}</button>
        </form>
      </ResultCard>

      {err && <div className="card border-danger/50 text-danger">{err}</div>}

      {count !== null && (
        <ResultCard className={count > 0 ? "border-danger/50" : "border-success/50"}>
          <div className="flex items-center gap-4">
            {count === 0
              ? <ShieldCheck className="h-10 w-10 text-success" />
              : <ShieldAlert className="h-10 w-10 text-danger" />}
            <div>
              <div className="text-2xl font-semibold">
                {count === 0 ? t("safe") : t("found", { count: count.toLocaleString() })}
              </div>
              <p className="mt-1 text-sm text-fg-muted">
                {count === 0 ? t("safe_note") : t("unsafe_note")}
              </p>
            </div>
          </div>
        </ResultCard>
      )}
    </div>
  );
}
