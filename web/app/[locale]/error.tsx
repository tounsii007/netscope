"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" />
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
