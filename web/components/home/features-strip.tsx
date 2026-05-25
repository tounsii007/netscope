import { getTranslations } from "next-intl/server";
import { Zap, ShieldCheck, Globe2, Code2 } from "lucide-react";

/**
 * Four-card "why us" strip at the bottom of the landing page. Each
 * card uses its own accent color (brand orange / cyan / violet /
 * success) so the strip reads as a colourful summary rather than a
 * wall of identical tiles.
 */
export async function FeaturesStrip() {
  const t = await getTranslations("home.features");

  const items = [
    {
      icon: Zap,
      title: t("speed_title"),
      body: t("speed_body"),
      accent: "brand" as const,
    },
    {
      icon: ShieldCheck,
      title: t("privacy_title"),
      body: t("privacy_body"),
      accent: "success" as const,
    },
    {
      icon: Globe2,
      title: t("global_title"),
      body: t("global_body"),
      accent: "cyan" as const,
    },
    {
      icon: Code2,
      title: t("api_title"),
      body: t("api_body"),
      accent: "violet" as const,
    },
  ];

  return (
    <section aria-labelledby="features-title" className="mt-4">
      <header className="mb-6 text-center sm:mb-8">
        <h2 id="features-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-2 text-sm text-fg-muted sm:text-base">{t("subtitle")}</p>
      </header>
      <div className="grid gap-3 stagger sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, body, accent }) => {
          const tone =
            accent === "cyan"
              ? "text-cyan-soft bg-cyan-brand/10 ring-cyan-brand/25"
              : accent === "violet"
                ? "text-violet-soft bg-violet-brand/10 ring-violet-brand/25"
                : accent === "success"
                  ? "text-success bg-success/10 ring-success/25"
                  : "text-brand bg-brand/10 ring-brand/25";
          return (
            <article
              key={title}
              className="card-premium group"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tone}`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold sm:text-base">{title}</h3>
              <p className="mt-1 text-xs text-fg-muted sm:text-sm">{body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
