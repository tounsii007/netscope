import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Image } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { OgClient } from "./client";

const SLUG = "opengraph";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `tools.${SLUG}` });
  return {
    title:       t("meta_title"),
    description: t("meta_description"),
    alternates:  { canonical: `/opengraph` },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations(`tools.${SLUG}`);
  return (
    <ToolShell
      title={t("title")}
      subtitle={t("desc")}
      icon={<Image className="h-5 w-5" />}
    >
      <OgClient />
    </ToolShell>
  );
}
