import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Sparkles, Wrench, ShieldCheck, Brush } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { CHANGELOG, type ChangelogTag } from "@/lib/changelog";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelog" });
  return {
    title: t("meta_title"),
    description: t("meta_description"),
    alternates: { canonical: "/changelog" },
  };
}

const TAG_META: Record<ChangelogTag, { label: string; chip: string; Icon: React.ComponentType<{ className?: string }> }> = {
  feat:     { label: "New",      chip: "bg-brand/10 text-brand ring-brand/25",            Icon: Sparkles    },
  fix:      { label: "Fixed",    chip: "bg-success/10 text-success ring-success/25",      Icon: Wrench      },
  polish:   { label: "Polish",   chip: "bg-cyan-brand/10 text-cyan-soft ring-cyan-brand/25", Icon: Brush    },
  security: { label: "Security", chip: "bg-violet-brand/10 text-violet-soft ring-violet-brand/25", Icon: ShieldCheck },
};

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");

  return (
    <ToolShell
      title={t("title")}
      subtitle={t("subtitle")}
      icon={<Sparkles className="h-6 w-6" />}
      accent="brand"
    >
      <ol className="space-y-8">
        {CHANGELOG.map((release) => (
          <li key={release.date} className="relative pl-4 sm:pl-6">
            {/* Date rail — vertical line that runs the height of the
                release block on the left, brand-coloured to tie the
                page together with the rest of the visual system. */}
            <span
              aria-hidden="true"
              className="absolute left-0 top-1.5 bottom-0 w-px bg-gradient-to-b from-brand/40 via-border to-transparent"
            />
            <div className="mb-3 flex items-baseline gap-2">
              <time className="font-mono text-sm font-semibold text-fg">{release.date}</time>
              {release.version && (
                <span className="rounded-md border border-border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                  {release.version}
                </span>
              )}
            </div>
            <ul className="space-y-2">
              {release.items.map((item, i) => {
                const meta = TAG_META[item.tag];
                const Icon = meta.Icon;
                return (
                  <li
                    key={`${release.date}-${i}`}
                    className="flex items-start gap-3 rounded-xl border border-border bg-bg-card/60 p-3 sm:p-4"
                  >
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md ring-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${meta.chip}`}
                    >
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{item.title}</p>
                      {item.body && (
                        <p className="mt-0.5 text-sm text-fg-muted">{item.body}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </ToolShell>
  );
}
