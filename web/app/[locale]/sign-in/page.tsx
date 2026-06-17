import { signIn } from "@/auth";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";

/**
 * Locale-aware metadata — title is translated per request locale.
 * Next.js calls this on every render; getTranslations resolves against the
 * active locale set by the [locale] segment.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return {
    title: t("meta_title"),
    robots: { index: false, follow: false },
  };
}

export default async function SignIn() {
  const t = await getTranslations("auth");
  return (
    <div className="relative isolate flex min-h-[80vh] items-center justify-center px-4 py-12">
      {/* Ambient orbs to soften the otherwise sparse sign-in surface. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <div className="h-[420px] w-[420px] rounded-full bg-brand/12 blur-[120px]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-1/4 -z-10 h-72 w-72 rounded-full bg-violet-brand/15 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 left-1/4 -z-10 h-72 w-72 rounded-full bg-cyan-brand/15 blur-[100px]"
      />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="card-premium relative overflow-hidden !p-0">
          {/* Top accent stripe to give the card a sense of orientation */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand via-violet-brand to-cyan-brand"
          />
          <div className="px-6 py-7 sm:px-8 sm:py-9">
            <div className="flex flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 rounded-xl ring-1 ring-border"
                aria-hidden="true"
              />
              <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-bg-elevated/70 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
                <Sparkles className="h-3 w-3 text-brand" aria-hidden="true" />
                Traceronix
              </span>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
                {t("signin_title")}
              </h1>
              <p className="mt-2 max-w-xs text-sm text-fg-muted">
                {t("signin_subtitle")}
              </p>
            </div>

            <div className="mt-7 space-y-2.5">
              {/*
               * F-FE-06: the previous redirectTo target "/app" does not
               * resolve to any route in this Next.js tree — all real
               * pages live under app/[locale]/. Sending the user there
               * after a successful OAuth round-trip produced a localized
               * 404 ("Page not found"), making the sign-in flow appear
               * broken even though auth itself succeeded. The actual
               * post-auth landing page is /dashboard (next-intl rewrites
               * unprefixed paths to the active locale because
               * routing.ts uses localePrefix: "as-needed"). The target
               * must ALSO appear in AllowedCallbackPaths in auth.ts —
               * see the F-FE-07 note there.
               */}
              <form action={async () => { "use server"; await signIn("github", { redirectTo: "/dashboard" }); }}>
                <button
                  type="submit"
                  className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm font-medium text-fg transition hover:border-fg-muted hover:bg-bg-card"
                >
                  {/* lucide-react 1.0 removed brand icons (no `Github`
                      export). Inline the GitHub mark as an SVG, matching the
                      Google button's inline-SVG pattern just below. */}
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56v-2.02c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.53 11.53 0 0 0 23.5 12.02C23.5 5.74 18.27.5 12 .5z"/>
                  </svg>
                  {t("continue_github")}
                </button>
              </form>
              <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}>
                <button
                  type="submit"
                  className="group flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm font-medium text-fg transition hover:border-fg-muted hover:bg-bg-card"
                >
                  <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.2 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  {t("continue_google")}
                </button>
              </form>
            </div>

            {/* Divider with copy */}
            <div className="mt-6 flex items-center gap-3 text-[11px] uppercase tracking-wider text-fg-subtle">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              <span>OAuth</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
            <p className="mt-3 text-center text-xs text-fg-subtle">
              We never request write access — read-only profile only.
            </p>
          </div>
        </div>

        {/* Back to home */}
        <p className="mt-5 text-center text-xs text-fg-subtle">
          <Link href="/" className="hover:text-fg transition">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
