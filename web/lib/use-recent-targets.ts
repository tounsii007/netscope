"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "tx:recent:";
const MAX_ENTRIES = 5;

/**
 * Persist the last-N target strings the user has submitted on a given
 * tool, keyed by a stable slug. localStorage lives forever (until the
 * user clears it) so power-users get one-click access to last week's
 * domains.
 *
 * No PII concern — these are domains / IPs the user is actively
 * looking up; same data is already in their browser history.
 *
 * Storage shape: a JSON array of strings, most-recent first, capped
 * at MAX_ENTRIES. Duplicates are deduped on insert (case-insensitive)
 * and the most-recent copy wins.
 */
export function useRecentTargets(toolSlug: string): {
  recent: string[];
  remember: (value: string) => void;
  forget: (value: string) => void;
  clear: () => void;
} {
  // Start empty server-side to avoid hydration mismatch; load from
  // localStorage in the post-mount effect.
  const [recent, setRecent] = useState<string[]>([]);

  // Hydrate from localStorage exactly once per slug.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + toolSlug);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Defensive: drop non-string entries and cap length. A
        // corrupted entry from a stale version shouldn't crash the
        // dropdown.
        setRecent(
          parsed
            .filter((x): x is string => typeof x === "string" && x.length > 0)
            .slice(0, MAX_ENTRIES),
        );
      }
    } catch {
      // Storage quota exceeded / corrupted JSON / privacy-mode
      // SecurityError — silently fall back to empty. No log: the
      // feature is "remember if you can" not "remember at all costs".
    }
  }, [toolSlug]);

  // Persist back to localStorage whenever the list changes. Swallows
  // QuotaExceededError so a tab in a tight private mode doesn't crash.
  const persist = useCallback(
    (next: string[]) => {
      try {
        window.localStorage.setItem(
          STORAGE_PREFIX + toolSlug,
          JSON.stringify(next),
        );
      } catch {
        /* ignore — see hydrate handler */
      }
    },
    [toolSlug],
  );

  const remember = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setRecent((current) => {
        // Case-insensitive dedup: a user looking up "Example.com" then
        // "example.com" should see one entry, not two.
        const folded = trimmed.toLowerCase();
        const filtered = current.filter((v) => v.toLowerCase() !== folded);
        const next = [trimmed, ...filtered].slice(0, MAX_ENTRIES);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const forget = useCallback(
    (value: string) => {
      setRecent((current) => {
        const next = current.filter((v) => v !== value);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clear = useCallback(() => {
    setRecent([]);
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + toolSlug);
    } catch {
      /* ignore */
    }
  }, [toolSlug]);

  return { recent, remember, forget, clear };
}
