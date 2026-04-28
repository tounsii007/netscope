import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "de", "fr", "es", "it", "pl", "ru", "uk", "tr", "hi", "zh"],
  defaultLocale: "en",
  localePrefix: "as-needed",   // /de/... but / for en (not /en/)
});
