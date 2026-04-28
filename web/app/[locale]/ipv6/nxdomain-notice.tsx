"use client";

import { useTranslations } from "next-intl";
import { ServerCrash } from "lucide-react";
import type { Ipv6Result } from "@/lib/api";

/**
 * Friendly NXDOMAIN message. Shown instead of the regular results when
 * a response has every DNS field empty — that almost always means the
 * domain doesn't exist, and rendering "0/100 with six red ✗ rows"
 * would mislead users into thinking the domain "fails IPv6".
 */
export function NxdomainNotice({ data }: { data: Ipv6Result }) {
  const t = useTranslations("ipv6");
  return (
    <div className="card border-danger/50 bg-danger/5 flex items-start gap-3">
      <ServerCrash className="h-5 w-5 text-danger shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold text-danger">{t("nxdomain_title")}</div>
        <div className="mt-1 text-sm text-fg-muted">
          {t("nxdomain_message", { domain: data.domain })}
        </div>
        <ul className="mt-3 list-disc list-inside text-sm text-fg-muted space-y-0.5">
          <li>{t("nxdomain_hint_typo")}</li>
          <li>{t("nxdomain_hint_scheme")}</li>
          <li>{t("nxdomain_hint_resolver")}</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Heuristic: a response with every DNS field empty is almost always a
 * non-existent domain. We treat that as a special case so the score
 * card doesn't lie about an unresolvable host.
 */
export function looksUnresolved(d: Ipv6Result): boolean {
  return (
    !d.apex.a &&
    !d.apex.aaaa &&
    !d.www.a &&
    !d.www.aaaa &&
    d.nameservers.total === 0 &&
    d.mxRecords.total === 0
  );
}
