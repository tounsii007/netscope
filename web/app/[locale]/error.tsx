"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

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
    <div className="mx-auto max-w-xl py-16 text-center" role="alert" aria-live="assertive">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold">{t("error_title")}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {error.message || t("error")}
      </p>
      {error.digest && <p className="mt-1 font-mono text-xs text-fg-subtle">ID: {error.digest}</p>}
      <button onClick={reset} className="btn mt-6">{t("retry")}</button>
    </div>
  );
}
