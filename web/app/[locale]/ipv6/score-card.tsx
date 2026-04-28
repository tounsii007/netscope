"use client";

import { useTranslations } from "next-intl";
import type { Ipv6Result } from "@/lib/api";
import { ResultCard } from "@/components/tool-shell";

/**
 * Big-number IPv6 score card. Colour follows the danger / warn /
 * success thresholds used elsewhere in the dashboard so users build
 * pattern-recognition across tools (red ≤ 40, amber 40–79, green ≥ 80).
 */
export function ScoreCard({ data }: { data: Ipv6Result }) {
  const t = useTranslations("ipv6");
  const colour =
    data.score >= 80 ? "#10b981" : data.score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <ResultCard>
      <div className="flex items-center gap-6">
        <div className="text-6xl font-bold" style={{ color: colour }}>
          {data.score}
          <span className="text-lg text-fg-muted">/100</span>
        </div>
        <div>
          <div className="text-xl">{t("grade")}</div>
          <div className="text-sm text-fg-muted">{data.domain}</div>
        </div>
      </div>
    </ResultCard>
  );
}
