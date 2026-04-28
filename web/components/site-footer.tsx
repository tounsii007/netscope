import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-16 border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl 2xl:max-w-7xl flex-col gap-2 px-3 sm:px-4 md:px-6 py-6 sm:py-8 text-sm text-fg-muted md:flex-row md:items-center md:justify-between">
        <p>{t("copyright", { year: new Date().getFullYear() })} {t("tagline")}</p>
        <div className="flex gap-4">
          <a href="/status" className="hover:text-fg">{t("status")}</a>
        </div>
      </div>
    </footer>
  );
}
