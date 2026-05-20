import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Wifi } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { ToolExplainer } from "@/components/tool-explainer";
import { Ipv6Client } from "./client";

const SLUG = "ipv6";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `tools.${SLUG}` });
  return {
    title:       t("meta_title"),
    description: t("meta_description"),
    alternates:  { canonical: `/ipv6` },
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
      icon={<Wifi className="h-6 w-6" />}
      accent="brand"
    >
      <Ipv6Client />
      <ToolExplainer slug={SLUG} locale={locale} />
    </ToolShell>
  );
}
