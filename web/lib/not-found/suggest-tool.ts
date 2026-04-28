import { TOOL_LINKS } from "@/components/site-nav";
import { levenshtein } from "@/lib/not-found/levenshtein";

/**
 * Find the tool slug closest to `query` by edit distance, but only
 * suggest one if the distance is small enough that it's plausibly a
 * typo (≤ 60 % of the longer string). Below that threshold we say
 * nothing rather than mislead the user with an unrelated tool —
 * "totally-unrelated-thing" should NOT match "ip-lookup".
 */
export function suggestTool(query: string): { href: string; key: string } | null {
  if (!query || query.length < 2) return null;

  const cleaned = query.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!cleaned) return null;

  let best: { href: string; key: string; dist: number } | null = null;
  for (const link of TOOL_LINKS) {
    const slug = link.href.replace(/^\//, "");
    const dist = levenshtein(cleaned, slug);
    if (!best || dist < best.dist) {
      best = { href: link.href, key: link.key, dist };
    }
  }
  if (!best) return null;

  // 60 % threshold against the longer of (input, slug) — picked so
  // "ip-lookupjsdoijsfukfu" (21 chars) vs "ip-lookup" (9 chars) →
  // distance 12, threshold 0.6 × 21 = 12.6 → still considered a match.
  const threshold = Math.max(
    3,
    Math.ceil(0.6 * Math.max(cleaned.length, best.href.length - 1))
  );
  if (best.dist > threshold) return null;
  return { href: best.href, key: best.key };
}
