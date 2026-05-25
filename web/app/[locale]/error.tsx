"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error(error);
    // Forward client-side render errors to the structured server log so
    // we see them in the same place as backend failures. Best-effort —
    // if /api/log itself is down we don't want to crash the error page.
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // sendBeacon-style fire-and-forget; ignored response.
      keepalive: true,
      body: JSON.stringify({
        level: "error",
        message: error.message || "client error boundary triggered",
        meta: {
          digest: error.digest,
          stack: error.stack?.slice(0, 4_000),
          path: typeof window !== "undefined" ? window.location.pathname : "",
        },
      }),
    }).catch(() => { /* swallow — telemetry must not throw on the error page */ });
  }, [error]);

  return (
    <div
      className="relative isolate mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center py-16 text-center"
      role="alert"
      aria-live="assertive"
    >
      {/* Soft danger-tinted halo behind the icon — calls attention to
          the error without flashing red across the whole viewport. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
      >
        <div className="h-72 w-72 rounded-full bg-danger/12 blur-[100px]" />
      </div>

      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/12 text-danger ring-1 ring-danger/30 shadow-lg shadow-danger/20">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl ring-1 ring-danger/40 animate-ping-slow preserve-motion"
        />
      </div>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
        {t("error_title")}
      </h1>
      <p className="mt-2 max-w-md text-sm text-fg-muted sm:text-base">
        {error.message || t("error")}
      </p>
      {error.digest && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated/70 px-2.5 py-1 font-mono text-[11px] text-fg-subtle">
          ID: <span className="text-fg-muted">{error.digest}</span>
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <button onClick={reset} className="btn-primary shine-on-hover group">
          <RefreshCw
            className="h-4 w-4 transition group-hover:rotate-180"
            aria-hidden="true"
          />
          {t("retry")}
        </button>
        <Link href="/" className="btn-ghost gap-2">
          <Home className="h-4 w-4" aria-hidden="true" />
          {t("back_home")}
        </Link>
      </div>
    </div>
  );
}
