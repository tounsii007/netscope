import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Spinner } from "@/components/tool-shell";
import { Globe } from "lucide-react";
import { ToolShell } from "@/components/tool-shell";
import { ToolExplainer } from "@/components/tool-explainer";
import { IpClient } from "./client";

const SLUG = "ip-lookup";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `tools.${SLUG}` });
  return {
    title:       t("meta_title"),
    description: t("meta_description"),
    alternates:  { canonical: `/ip-lookup` },
  };
}

// IpClient uses useSearchParams() which requires a Suspense boundary in Next.js 15.
// Without it the whole page throws during SSR when ?host= param is present.
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations(`tools.${SLUG}`);
  return (
    <ToolShell
      title={t("title")}
      subtitle={t("desc")}
      icon={<Globe className="h-5 w-5" />}
    >
      <Suspense fallback={<div className="card flex items-center gap-2"><Spinner /> Loading…</div>}>
        <IpClient />
      </Suspense>
      <ToolExplainer slug={SLUG} locale={locale} />
    </ToolShell>
  );
}
