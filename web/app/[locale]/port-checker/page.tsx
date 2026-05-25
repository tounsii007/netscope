import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Network } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { ToolExplainer } from "@/components/tool-explainer";
import { PortCheckerClient } from "./client";

const SLUG = "port-checker";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `tools.${SLUG}` });
  return {
    title:       t("meta_title"),
    description: t("meta_description"),
    alternates:  { canonical: `/port-checker` },
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
      icon={<Network className="h-6 w-6" />}
      accent="brand"
    >
      <PortCheckerClient />
      <ToolExplainer slug={SLUG} locale={locale} />
    </ToolShell>
  );
}
