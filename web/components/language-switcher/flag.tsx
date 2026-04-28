/**
 * Locale → ISO 3166-1 alpha-2 country code for the flag image.
 *
 * We avoid the unicode regional-indicator emoji (🇺🇸 etc.) because
 * Windows' Segoe UI Emoji font ships without flag glyphs and renders
 * them as letter pairs ("US"). FlagCDN serves real PNG flags
 * identically on every platform.
 *
 *   en → us  (American English content)
 *   uk → ua  (Ukrainian language → Ukraine flag, NOT United Kingdom)
 *   zh → sg  (Singapore — historical choice; switch to cn/tw if we
 *            ever add multiple Chinese variants)
 */
const COUNTRY: Record<string, string> = {
  en: "us",
  de: "de",
  fr: "fr",
  es: "es",
  it: "it",
  pl: "pl",
  ru: "ru",
  uk: "ua",
  tr: "tr",
  hi: "in",
  zh: "sg",
};

/**
 * Render a small country flag using FlagCDN's free PNG endpoint. Width
 * and height are fixed so layout doesn't reflow while the image loads,
 * and the 2× / 3× srcSet keeps it crisp on retina displays.
 */
export function Flag({
  locale,
  className = "",
}: {
  locale: string;
  className?: string;
}) {
  const cc = COUNTRY[locale] ?? "un"; // 'un' = UN flag, used as a generic fallback
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/20x15/${cc}.png`}
      srcSet={`https://flagcdn.com/40x30/${cc}.png 2x, https://flagcdn.com/60x45/${cc}.png 3x`}
      width={20}
      height={15}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      className={`inline-block shrink-0 rounded-[2px] shadow-sm ring-1 ring-black/10 ${className}`}
    />
  );
}
