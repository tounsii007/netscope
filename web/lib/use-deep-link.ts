"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * Two-way binding between a single input value and the `?target=` URL
 * query parameter. Used by every tool with a primary text input so
 * users can share a pre-filled link:
 *
 *   https://traceronix.io/de/port-checker?target=example.com
 *
 * On mount:
 *   • If `?target=` is present, sets the input via the supplied
 *     setter AND fires `onAutoRun` once so the tool actually runs the
 *     query without a second click. The "once" guard uses a ref so
 *     React strict-mode double-mount doesn't fire the network call
 *     twice.
 *
 * The returned `buildUrl(value)` is a PURE function (just URL string
 * construction, no router writes) so it's safe to call on every
 * render. `pushUrl(value)` performs the side-effecting
 * `router.replace` — call it on submit, not on render.
 */
export function useDeepLink(opts: {
  /** Setter for the input that should be prefilled from ?target=. */
  setTarget: (value: string) => void;
  /** Called once after prefill, only when ?target= was present. */
  onAutoRun?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    const t = params.get("target");
    if (t && t.trim()) {
      consumed.current = true;
      opts.setTarget(t.trim());
      // Defer the run by a tick so state set above commits before
      // the form's submit handler reads it. Without setTimeout the
      // first request would race the React batch and see the OLD
      // value.
      if (opts.onAutoRun) {
        const id = window.setTimeout(opts.onAutoRun, 0);
        return () => window.clearTimeout(id);
      }
    }
    // Run only on the first mount — re-firing on every param change
    // would auto-submit the form every time the user edited it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Pure URL constructor — no router writes. Safe to call inside
   * render, useMemo, event handlers, anywhere. Returns the absolute
   * URL when window.location is available, relative otherwise.
   */
  const buildUrl = useCallback(
    (value: string): string => {
      const next = new URLSearchParams();
      if (value && value.trim()) next.set("target", value.trim());
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (typeof window !== "undefined") {
        return `${window.location.origin}${url}`;
      }
      return url;
    },
    [pathname],
  );

  /**
   * Side-effecting URL writer. Replaces the current history entry
   * (no scroll, no back-button trap). Call it on submit / successful
   * lookup — NOT on every keystroke.
   */
  const pushUrl = useCallback(
    (value: string): string => {
      const url = buildUrl(value);
      const path = typeof window !== "undefined"
        ? url.slice(window.location.origin.length)
        : url;
      router.replace(path, { scroll: false });
      return url;
    },
    [router, buildUrl],
  );

  return { buildUrl, pushUrl };
}
