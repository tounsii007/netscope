import type { Metadata, Viewport } from "next";
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

/**
 * Mobile theme + viewport settings. `themeColor` matches the page bg
 * so iOS Safari and Android Chrome paint a consistent address-bar
 * tint instead of the default white. `viewportFit: "cover"` lets us
 * use safe-area insets for notched devices later without revisiting
 * this file.
 */
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
  const t = await getTranslations({ locale, namespace: "nav" });
  return (
    <html lang={locale} dir={dir} className={`dark ${inter.variable} ${mono.variable}`}>
      <head>
        {/*
          Preconnect to the four cross-origin asset hosts we hit from
          almost every page so the browser parallelises DNS + TCP +
          TLS setup with the HTML response, shaving ~100-300 ms off
          the first byte of each subresource.

          • flagcdn.com         — country flag PNGs (every locale switch
                                  + every IP / WHOIS result)
          • basemaps.cartocdn.com / *.basemaps.cartocdn.com — map tiles
                                  (the IP-lookup map dynamically lazy-
                                  loads these on demand)
          • tile.openstreetmap.org — OSM tile fallback
          • api.pwnedpasswords.com  — Have-I-Been-Pwned k-anonymity
                                       endpoint used by the password-leak tool

          We deliberately do NOT use dns-prefetch here because preconnect
          subsumes it on every browser shipped after 2020. dns-prefetch
          would add a redundant DNS query when preconnect is already
          warming the same connection. `crossOrigin="anonymous"` matches
          the CORS mode the images/JSON are actually fetched with — a
          mismatched mode would force the browser to open a second
          connection and waste the preconnect entirely.
        */}
        <link rel="preconnect" href="https://flagcdn.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.pwnedpasswords.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-bg font-sans antialiased">
        <NextIntlClientProvider messages={messages}>
          {/* Skip-to-content link — invisible until focused. Lets keyboard
              and screen-reader users bypass the nav and jump straight to
              the main content of every page. */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]
                       focus:rounded-lg focus:bg-bg-elevated focus:px-4 focus:py-2 focus:text-sm
                       focus:font-medium focus:text-fg focus:ring-2 focus:ring-brand"
          >
            {t("skip_to_content")}
          </a>
          <SiteNav />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl 2xl:max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 outline-none"
          >
            {children}
          </main>
          <SiteFooter />
          <WebVitalsReporter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
