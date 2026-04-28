import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";
import "../globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    metadataBase: new URL("https://traceronix.io"),
    title: { default: t("title"), template: "%s · Traceronix" },
    description: t("description"),
    openGraph: { type: "website", siteName: "Traceronix" },
    twitter: { card: "summary_large_image" },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (
    !(routing.locales as readonly string[]).includes(locale)
  ) notFound();
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  return (
    <html lang={locale} dir={dir} className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          <SiteNav />
          <main className="mx-auto w-full max-w-6xl 2xl:max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">{children}</main>
          <SiteFooter />
          <WebVitalsReporter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
