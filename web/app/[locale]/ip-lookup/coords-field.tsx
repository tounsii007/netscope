"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";

/**
 * Latitude/longitude cell with a tap-to-copy button. Encapsulates the
 * transient "✓ copied" state and the OSM jump-link so the parent grid
 * can declare it as a single Field value without local state of its own.
 */
export function CoordsField({ lat, lon }: { lat: number; lon: number }) {
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${lat}, ${lon}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silent */
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono hover:text-brand transition"
      >
        {lat.toFixed(4)}, {lon.toFixed(4)} ↗
      </a>
      <button
        type="button"
        onClick={copy}
        className="rounded p-1 text-fg-subtle hover:bg-bg-elevated hover:text-fg"
        aria-label={tc("copy")}
        title={tc("copy")}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}
