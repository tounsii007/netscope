import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Activity } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { DashboardClient } from "./client";

const SLUG = "dashboard";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `tools.${SLUG}` });
  return {
    title:       t("meta_title"),
    description: t("meta_description"),
    robots:      { index: false, follow: false },
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
      icon={<Activity className="h-5 w-5" />}
    >
      <DashboardClient />
    </ToolShell>
  );
}
