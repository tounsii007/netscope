import { getTranslations } from "next-intl/server";
import { Info, Cog, Target, AlertCircle } from "lucide-react";
import { ExplainerColumn } from "@/components/tool-explainer/explainer-column";
import { safeT, splitBullets } from "@/components/tool-explainer/split-bullets";

/**
 * Per-tool explainer rendered at the bottom of every tool page.
 *
 * Pulls a structured explanation from {@code tools.<slug>.explainer.*}
 * with four sections:
 *   • purpose       — paragraph: what the tool does and why it exists
 *   • how_it_works  — bullets: technical mechanism in plain language
 *   • when_to_use   — bullets: concrete scenarios where it helps
 *   • limits        — bullets: caveats / what it cannot tell you
 *
 * Renders nothing when {@code purpose} is missing — tools without copy
 * degrade to no card at all rather than an empty placeholder.
 *
 * Visual layout: a glass card with three coloured top "tabs" linking
 * each column to its accent (brand / success / warn). Reads as a
 * mini-dashboard rather than a wall of prose.
 */
export async function ToolExplainer({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const t = await getTranslations({
    locale,
    namespace: `tools.${slug}.explainer`,
  });

  // Probe for a populated namespace. next-intl returns the key itself
  // when missing, so we compare the rendered value to detect that.
  let purpose: string;
  try {
    purpose = t("purpose");
  } catch {
    return null;
  }
  if (!purpose || purpose === "purpose" || purpose.endsWith(".purpose")) {
    return null;
  }

  const how = splitBullets(safeT(t, "how_it_works"));
  const when = splitBullets(safeT(t, "when_to_use"));
  const limits = splitBullets(safeT(t, "limits"));

  // Section headings live in their own namespace so they don't have
  // to be duplicated 23 × per locale.
  const th = await getTranslations({ locale, namespace: "explainer" });

  return (
    <section
      aria-labelledby={`explainer-${slug}`}
      className="relative isolate mt-12 overflow-hidden rounded-2xl border border-border bg-bg-card/60"
    >
      {/* Soft mesh wash so the explainer feels alive against the page
          bg but doesn't compete with the result panel above it. */}
      <div aria-hidden="true" className="absolute inset-0 bg-mesh-2 opacity-25" />
      <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-30" />

      <div className="relative px-5 py-6 sm:px-7 sm:py-7">
        <h2
          id={`explainer-${slug}`}
          className="mb-3 flex items-center gap-2 text-base font-semibold text-fg"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/25">
            <Info className="h-4 w-4" aria-hidden="true" />
          </span>
          {th("about_title")}
        </h2>

        <p className="text-sm leading-relaxed text-fg-muted sm:text-[15px]">
          {purpose}
        </p>

        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {how.length > 0 && (
            <ExplainerColumn
              accent="brand"
              icon={<Cog className="h-4 w-4" />}
              heading={th("how_title")}
              bullets={how}
            />
          )}
          {when.length > 0 && (
            <ExplainerColumn
              accent="success"
              icon={<Target className="h-4 w-4" />}
              heading={th("when_title")}
              bullets={when}
            />
          )}
          {limits.length > 0 && (
            <ExplainerColumn
              accent="warn"
              icon={<AlertCircle className="h-4 w-4" />}
              heading={th("limits_title")}
              bullets={limits}
            />
          )}
        </div>
      </div>
    </section>
  );
}
