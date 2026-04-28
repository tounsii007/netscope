/**
 * SVG flag component for an ISO 3166-1 alpha-2 country code.
 *
 * We avoid the unicode regional-indicator emoji (🇺🇸) because Windows'
 * Segoe UI Emoji font ships without flag glyphs and renders them as
 * literal letter pairs ("US"). FlagCDN serves real PNG flags identically
 * on every platform.
 */
export function CountryFlag({
  code,
  className = "",
  size = "20x15",
}: {
  code?: string;
  className?: string;
  size?: "20x15" | "40x30" | "80x60";
}) {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return null;
  const cc = code.toLowerCase();
  const retina = size === "20x15" ? "40x30" : "80x60";
  const w = size === "20x15" ? 20 : size === "40x30" ? 40 : 80;
  const h = size === "20x15" ? 15 : size === "40x30" ? 30 : 60;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${size}/${cc}.png`}
      srcSet={`https://flagcdn.com/${retina}/${cc}.png 2x`}
      width={w}
      height={h}
      alt={`${code.toUpperCase()} flag`}
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10 ${className}`}
    />
  );
}
