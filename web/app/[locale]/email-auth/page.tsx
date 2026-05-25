import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { ToolExplainer } from "@/components/tool-explainer";
import { EmailAuthClient } from "./client";

const SLUG = "email-auth";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `tools.${SLUG}` });
  return {
    title:       t("meta_title"),
    description: t("meta_description"),
    alternates:  { canonical: `/email-auth` },
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
      icon={<ShieldAlert className="h-6 w-6" />}
      accent="success"
    >
      <EmailAuthClient />
      <ToolExplainer slug={SLUG} locale={locale} />
    </ToolShell>
  );
}
