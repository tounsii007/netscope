import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import hi from "@/messages/hi.json";
import zh from "@/messages/zh.json";

/**
 * `app/[locale]/not-found.tsx` is now an *async* Server Component:
 * it awaits getTranslations(), getLocale(), headers(), and the
 * Levenshtein-based suggestion logic before returning JSX.
 *
 * RTL can't render async components directly, so we resolve the
 * promise first and then hand the resulting tree to render(). The
 * server-side dependencies are mocked so the function can run in
 * the jsdom environment.
 */

const localeRef = { current: "en" };
const messages: Record<string, Record<string, unknown>> = { en, de, hi, zh };

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl/server")>(
    "next-intl/server"
  );
  return {
    ...actual,
    getLocale: async () => localeRef.current,
    getTranslations: async ({ namespace }: { locale?: string; namespace: string }) => {
      // Mirror next-intl's nested-key resolver well enough for the keys
      // the not-found page actually reads.
      const root = (messages[localeRef.current] as Record<string, unknown>) ?? {};
      const ns = namespace.split(".").reduce<unknown>(
        (acc, k) => (acc as Record<string, unknown>)?.[k],
        root
      ) as Record<string, string> | undefined;
      return (key: string) => ns?.[key] ?? key;
    },
  };
});

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "" }),
}));

// Stable import target — must come AFTER the vi.mock calls above so the
// mocked deps land before the page module evaluates.
const NotFound = (await import("@/app/[locale]/not-found")).default;

async function renderNotFound(locale: keyof typeof messages = "en") {
  localeRef.current = locale;
  const tree = await NotFound();
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
      {tree}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  localeRef.current = "en";
});

describe("NotFound page", () => {
  it("renders the 404 number and back-home link in English", async () => {
    const { getByText, getByRole } = await renderNotFound("en");
    expect(getByText("404")).toBeInTheDocument();
    expect(getByText(/Page not found/i)).toBeInTheDocument();
    expect(getByRole("link", { name: /Back home/i })).toHaveAttribute("href", "/");
  });

  it("renders the description (English)", async () => {
    const { getByText } = await renderNotFound("en");
    expect(getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
  });

  it("renders translated content in German", async () => {
    const { getByText, getByRole } = await renderNotFound("de");
    expect(getByText(/Seite nicht gefunden/i)).toBeInTheDocument();
    expect(getByRole("link", { name: /Zur Startseite/i })).toBeInTheDocument();
  });

  it("renders translated content in Hindi", async () => {
    const { getByText } = await renderNotFound("hi");
    // hi.json's "title" — kept loose to survive minor wording polish
    expect(getByText((messages.hi.not_found as Record<string, string>).title)).toBeInTheDocument();
  });

  it("renders translated content in Chinese", async () => {
    const { getByText } = await renderNotFound("zh");
    expect(getByText((messages.zh.not_found as Record<string, string>).title)).toBeInTheDocument();
  });
});
