/**
 * Split a translator string into bullet items. Localisers should be
 * able to write naturally without worrying about JSON arrays, so we
 * accept several common separator shapes:
 *
 *   • "First.\nSecond.\nThird."        — newlines
 *   • "First. • Second. • Third."      — bullet glyphs
 *   • "First.||Second.||Third."        — legacy double-pipe
 *
 * Each entry is trimmed and empty pieces are dropped.
 */
export function splitBullets(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\n+|\s*\|\|\s*|\s*•\s+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Tolerant translator call — never throws, returns "" when the key is
 * missing. Necessary because next-intl returns the key itself for
 * unknown keys, and we want optional explainer sections to silently
 * omit instead of rendering "tools.foo.explainer.limits" as the body.
 */
export function safeT(t: (k: string) => string, key: string): string {
  try {
    const v = t(key);
    if (!v || v === key || v.endsWith("." + key)) return "";
    return v;
  } catch {
    return "";
  }
}
