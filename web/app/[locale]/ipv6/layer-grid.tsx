"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Ipv6Result } from "@/lib/api";

/**
 * 6-cell grid summarising AAAA coverage across each layer that
 * contributes to the overall score: apex A/AAAA, www A/AAAA, NS, MX.
 *
 * Ticked when the layer is fully IPv6-enabled; for NS/MX that means
 * every record has IPv6, not just one of them.
 */
export function LayerGrid({ data }: { data: Ipv6Result }) {
  const t = useTranslations("ipv6");
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Row label={t("row_apex_a")}    ok={data.apex.a} />
      <Row label={t("row_apex_aaaa")} ok={data.apex.aaaa} />
      <Row label={t("row_www_a")}     ok={data.www.a} />
      <Row label={t("row_www_aaaa")}  ok={data.www.aaaa} />
      <Row
        label={t("row_ns", {
          with: data.nameservers.withIpv6,
          total: data.nameservers.total,
        })}
        ok={
          data.nameservers.total > 0 &&
          data.nameservers.withIpv6 === data.nameservers.total
        }
      />
      <Row
        label={t("row_mx", {
          with: data.mxRecords.withIpv6,
          total: data.mxRecords.total,
        })}
        ok={
          data.mxRecords.total > 0 &&
          data.mxRecords.withIpv6 === data.mxRecords.total
        }
      />
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="card flex items-center gap-3">
      {ok ? (
        <CheckCircle2 className="h-5 w-5 text-success" />
      ) : (
        <XCircle className="h-5 w-5 text-danger" />
      )}
      <span>{label}</span>
    </div>
  );
}
