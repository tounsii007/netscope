"use client";

import { useTranslations } from "next-intl";
import { LoadingButton } from "@/components/tool-shell";

/**
 * Domain input + submit. Renders a small hint badge whenever the
 * submitted value differs from what we'll actually query (URLs,
 * "www." prefix, paths get stripped) so the user can see the
 * normalisation happen instead of being silently rewritten on submit.
 */
export function SubdomainsForm({
  domain,
  onDomainChange,
  normalisedDomain,
  loading,
  onSubmit,
}: {
  domain: string;
  onDomainChange: (v: string) => void;
  normalisedDomain: string;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const t = useTranslations("subdomains");
  const tc = useTranslations("common");

  const wasNormalised =
    normalisedDomain.length > 0 &&
    normalisedDomain !== domain.trim().toLowerCase();

  return (
    <form onSubmit={onSubmit} className="card space-y-2">
      <div className="flex gap-2">
        <input
          className="input"
          value={domain}
          onChange={(e) => onDomainChange(e.target.value)}
          placeholder={t("input_placeholder") ?? "example.com"}
          autoComplete="off"
          spellCheck={false}
        />
        <LoadingButton loading={loading} loadingLabel={tc("loading")}>
          {tc("enumerate")}
        </LoadingButton>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
        <span>{t("input_hint")}</span>
        {wasNormalised && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-brand">
            {t("query_as", { domain: normalisedDomain })}
          </span>
        )}
      </div>
    </form>
  );
}
