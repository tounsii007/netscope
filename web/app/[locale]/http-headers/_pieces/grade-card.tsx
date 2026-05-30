/**
 * Hero "grade card" at the top of the HTTP-headers result panel.
 *
 * Renders the A+/A/B/C/D/F letter, a coloured progress bar synced to
 * the numeric score, and the analysed URL + HTTP status alongside.
 *
 * Tone palette is keyed off the letter grade because the score is a
 * continuum and a few headers (HSTS preload, CSP wildcard) move the
 * needle disproportionately. Pinning the colour to the grade keeps
 * the visual category consistent even when scores re-shuffle.
 */

import { Link as LinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultCard } from "@/components/tool-shell";

const GRADE_TONE: Record<
  string,
  { text: string; ring: string; bg: string; bar: string }
> = {
  "A+": { text: "text-success", ring: "ring-success/40", bg: "bg-success/10", bar: "bg-success" },
  A:    { text: "text-success", ring: "ring-success/40", bg: "bg-success/10", bar: "bg-success" },
  B:    { text: "text-warn",    ring: "ring-warn/40",    bg: "bg-warn/10",    bar: "bg-warn"    },
  C:    { text: "text-warn",    ring: "ring-warn/40",    bg: "bg-warn/10",    bar: "bg-warn"    },
  D:    { text: "text-danger",  ring: "ring-danger/40",  bg: "bg-danger/10",  bar: "bg-danger"  },
  F:    { text: "text-danger",  ring: "ring-danger/40",  bg: "bg-danger/10",  bar: "bg-danger"  },
};

export function GradeCard({
  grade, score, status, url,
}: {
  grade: string; score: number; status: number; url: string;
}) {
  const t = useTranslations("headers");
  const tone = GRADE_TONE[grade] ?? GRADE_TONE.C;
  return (
    <ResultCard className="relative overflow-hidden">
      <div className="flex items-center gap-6">
        <div
          className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl ring-2 ${tone.ring} ${tone.bg}`}
        >
          <span className={`text-5xl font-bold leading-none ${tone.text}`}>
            {grade}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2 py-1 text-xs">
            <LinkIcon className="h-3 w-3 text-cyan-soft" aria-hidden="true" />
            <span className="break-all font-mono text-fg">{url}</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-bg-elevated ring-1 ring-border">
            <div
              className={`h-full ${tone.bar} transition-all duration-700 ease-out`}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs">
            <span className={`font-mono font-semibold ${tone.text}`}>
              {t("score", { score })}
            </span>
            <span className="rounded-md bg-bg-elevated px-2 py-0.5 font-mono text-fg-muted ring-1 ring-border">
              {t("http_status", { status })}
            </span>
          </div>
        </div>
      </div>
    </ResultCard>
  );
}
