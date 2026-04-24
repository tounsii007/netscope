import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "de", "hi", "zh"],
  defaultLocale: "en",
  localePrefix: "as-needed",   // /de/... but / for en (not /en/)
});
