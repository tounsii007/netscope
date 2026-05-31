"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api, type HeadersResult } from "@/lib/api";
import { LoadingButton } from "@/components/tool-shell";
import { Link as LinkIcon, AlertCircle } from "lucide-react";
import { checkTargetGuard } from "@/lib/target-guard";

import { GradeCard }   from "./_pieces/grade-card";
import { CheckList }   from "./_pieces/check-list";
import { HstsPanel }   from "./_pieces/hsts-panel";
import { CspAudit }    from "./_pieces/csp-audit";
import { RawHeaders }  from "./_pieces/raw-headers";

/**
 * HTTP-headers tool — thin orchestrator. Each result panel is its own
 * file under {@code _pieces/}; this component owns the form, the
 * loading + error state, and the fetch dispatch. Splitting the
 * presentation pieces out keeps the orchestrator under 100 LOC and
 * lets each panel be unit-tested in isolation.
 */
export function HeadersClient() {
  const tc = useTranslations("common");
  const tg = useTranslations("guard");
  const [url, setUrl] = useState("https://github.com");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<HeadersResult | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setErr(tc("input_required"));
      setData(null);
      return;
    }
    const guard = checkTargetGuard(url);
    if (!guard.ok) {
      setErr(tg(guard.reasonKey));
      setData(null);
      return;
    }
    setErr(null); setLoading(true); setData(null);
    try { setData(await api.headers(url)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={run} noValidate className="card flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <LinkIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden="true"
          />
          <input
            className="input pl-9"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tc("enter_url")}
            aria-label={tc("enter_url")}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
        </div>
        <LoadingButton loading={loading} loadingLabel={tc("loading")}>
          {tc("analyze")}
        </LoadingButton>
      </form>

      {err && (
        <div
          className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{err}</span>
        </div>
      )}

      {data && (
        <div className="space-y-4" aria-live="polite">
          <GradeCard grade={data.grade} score={data.score} status={data.status} url={data.url} />
          <CheckList checks={data.checks} />
          {data.hsts && <HstsPanel hsts={data.hsts} />}
          {data.csp  && <CspAudit  csp={data.csp} />}
          <RawHeaders rawHeaders={data.rawHeaders} />
        </div>
      )}
    </div>
  );
}
