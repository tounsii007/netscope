"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { copyWithToast, useToast } from "@/components/toast/toast";

/**
 * Small inline "Copy" pill — usable next to any result heading where
 * the user might want to paste the underlying data into a ticket /
 * Slack message.
 *
 * Behaviour:
 *   • on success: shows a green check for 1.5 s + pushes a success
 *     toast ("Copied!")
 *   • on failure: pushes an error toast — usually means the browser
 *     blocked clipboard access (insecure context / permissions)
 *
 * The `text` prop can be a string (raw paste) or an object (auto-
 * serialised to pretty JSON). Most callers pass an object so the
 * resulting text is human-readable and stable across releases.
 */
export function CopyButton({
  value,
  className = "",
  label,
}: {
  /** Plain string OR any JSON-serialisable value (auto-stringified). */
  value: string | object;
  className?: string;
  /** Override the visible label. Defaults to the localised "Copy". */
  label?: string;
}) {
  const tc = useTranslations("common");
  const toast = useToast();
  const [justCopied, setJustCopied] = useState(false);

  function payload(): string {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); }
    catch { return String(value); }
  }

  async function onClick() {
    const ok = await copyWithToast(payload(), toast, {
      ok: tc("copied"),
      fail: tc("error"),
    });
    if (ok) {
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 1500);
    }
  }

  const Icon = justCopied ? Check : Copy;
  const textClass = justCopied ? "text-success" : "text-fg-muted";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? tc("copy")}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-[11px] transition hover:border-brand/40 hover:text-fg ${textClass} ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{justCopied ? tc("copied") : (label ?? tc("copy"))}</span>
    </button>
  );
}
