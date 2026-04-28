import { describe, it, expect, vi, beforeEach } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

// Mock next/navigation hooks the switcher relies on.
const pushMock = vi.fn();
const refreshMock = vi.fn();
let pathnameMock = "/port-checker";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: refreshMock,        // ← needed since the switcher calls router.refresh()
    prefetch: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => pathnameMock,
}));

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  pathnameMock = "/port-checker";
});

/**
 * The switcher renders FlagCDN PNGs for each locale (no Unicode flag
 * emojis — Windows fonts don't ship the regional-indicator glyphs).
 * Tests assert on the flag image src instead of an emoji glyph.
 */
function flagSrcCount(cc: string): number {
  return document.querySelectorAll(
    `img[src*="flagcdn.com/20x15/${cc}.png"]`
  ).length;
}

describe("LanguageSwitcher", () => {
  it("renders the current locale flag and full language name", () => {
    renderWithIntl(<LanguageSwitcher />);
    expect(screen.getByLabelText(/Switch language/i)).toBeInTheDocument();
    // US flag (we map en → us so the brand stays explicit) and the
    // current-locale label.
    expect(flagSrcCount("us")).toBeGreaterThan(0);
    expect(screen.getAllByText(/English/i).length).toBeGreaterThan(0);
  });

  it("lists all supported locales in the dropdown", () => {
    renderWithIntl(<LanguageSwitcher />);
    // Each locale's flag must appear at least once (button + dropdown row).
    expect(flagSrcCount("us")).toBeGreaterThan(0);
    expect(flagSrcCount("de")).toBeGreaterThan(0);
    expect(flagSrcCount("fr")).toBeGreaterThan(0);
    expect(flagSrcCount("es")).toBeGreaterThan(0);
    expect(flagSrcCount("it")).toBeGreaterThan(0);
    expect(flagSrcCount("pl")).toBeGreaterThan(0);
    expect(flagSrcCount("ru")).toBeGreaterThan(0);
    expect(flagSrcCount("ua")).toBeGreaterThan(0);  // Ukrainian → Ukraine
    expect(flagSrcCount("tr")).toBeGreaterThan(0);
    expect(flagSrcCount("in")).toBeGreaterThan(0);  // Hindi → India
    expect(flagSrcCount("sg")).toBeGreaterThan(0);  // Chinese → Singapore (historical)
    // A handful of native names — full set verified in i18n-bundles test
    expect(screen.getByText("Deutsch")).toBeInTheDocument();
    expect(screen.getByText("Français")).toBeInTheDocument();
    expect(screen.getByText("हिन्दी")).toBeInTheDocument();
    expect(screen.getByText("中文")).toBeInTheDocument();
  });

  it("translates the aria-label across locales", () => {
    const { unmount } = renderWithLocale(<LanguageSwitcher />, "de");
    expect(screen.getByLabelText(/Sprache wechseln/i)).toBeInTheDocument();
    unmount();

    const r2 = renderWithLocale(<LanguageSwitcher />, "zh");
    expect(r2.getByLabelText(/切换语言/)).toBeInTheDocument();
  });

  it("pushes the bare path (no prefix) when switching back to default locale", async () => {
    pathnameMock = "/de/port-checker";
    const user = userEvent.setup();
    renderWithLocale(<LanguageSwitcher />, "de");
    await user.click(screen.getByRole("button", { name: /English \(US\)/i }));
    expect(pushMock).toHaveBeenCalledWith("/port-checker");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("pushes a locale-prefixed path when switching to a non-default locale", async () => {
    pathnameMock = "/port-checker";
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);
    await user.click(screen.getByRole("button", { name: /Deutsch/i }));
    expect(pushMock).toHaveBeenCalledWith("/de/port-checker");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
