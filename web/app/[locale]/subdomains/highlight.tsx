/**
 * Highlight all occurrences of `needle` (case-insensitive) inside `text`.
 * Returns a fragment of spans so the matched substring is visually marked
 * without breaking accessibility (the underlying text stays selectable
 * and screen-readable as a single string).
 *
 * Lives in its own file so the same helper can be reused from any other
 * filter-driven list (whois, dns lookup tables, etc.) without dragging
 * the full subdomains client along with it.
 */
export function highlight(text: string, needle: string) {
  const n = needle.trim().toLowerCase();
  if (!n) return text;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(n, i);
    if (at === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark
        key={at}
        className="rounded-sm bg-brand/20 px-0.5 text-brand-foreground"
      >
        {text.slice(at, at + n.length)}
      </mark>
    );
    i = at + n.length;
  }
  return <>{parts}</>;
}
