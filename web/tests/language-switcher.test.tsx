import { describe, it, expect, vi, beforeEach } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

// Mock next/navigation hooks the switcher relies on.
const pushMock = vi.fn();
let pathnameMock = "/port-checker";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => pathnameMock,
}));

beforeEach(() => {
  pushMock.mockReset();
  pathnameMock = "/port-checker";
});

describe("LanguageSwitcher", () => {
  it("renders the current locale flag and full language name", () => {
    renderWithIntl(<LanguageSwitcher />);
    expect(screen.getByLabelText(/Switch language/i)).toBeInTheDocument();
    // English flag and label
    expect(screen.getAllByText("🇺🇸").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/English/i).length).toBeGreaterThan(0);
  });

  it("lists all four available locales in the dropdown", () => {
    renderWithIntl(<LanguageSwitcher />);
    expect(screen.getAllByText("🇺🇸").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇩🇪").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇮🇳").length).toBeGreaterThan(0);
    expect(screen.getAllByText("🇸🇬").length).toBeGreaterThan(0);
    expect(screen.getByText(/Deutsch/)).toBeInTheDocument();
    expect(screen.getByText(/हिन्दी/)).toBeInTheDocument();
    expect(screen.getByText(/中文/)).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /English/i }));
    expect(pushMock).toHaveBeenCalledWith("/port-checker");
  });

  it("pushes a locale-prefixed path when switching to a non-default locale", async () => {
    pathnameMock = "/port-checker";
    const user = userEvent.setup();
    renderWithIntl(<LanguageSwitcher />);
    await user.click(screen.getByRole("button", { name: /Deutsch/i }));
    expect(pushMock).toHaveBeenCalledWith("/de/port-checker");
  });
});
