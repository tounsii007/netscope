"use client";

import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { copyWithToast, useToast } from "@/components/toast/toast";

/**
 * Small Share pill that copies a deep-link URL to the clipboard so the
 * user can paste it into a ticket / chat / email and let the recipient
 * land on the same target pre-filled.
 *
 * Pure presentational. The caller supplies the URL — usually built
 * via `useDeepLink().writeTarget(currentTarget)` so the URL exactly
 * matches the input the user just submitted.
 */
export function ShareLink({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const tc = useTranslations("common");
  const toast = useToast();

  async function onClick() {
    await copyWithToast(url, toast, {
      ok: tc("share_copied"),
      fail: tc("error"),
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tc("share")}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-[11px] text-fg-muted transition hover:border-brand/40 hover:text-fg ${className}`}
    >
      <Share2 className="h-3 w-3" aria-hidden="true" />
      <span>{tc("share")}</span>
    </button>
  );
}
