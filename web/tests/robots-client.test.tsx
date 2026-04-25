import { describe, it, expect } from "vitest";
import { RobotsClient } from "@/app/[locale]/robots/client";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

describe("RobotsClient", () => {
  it("renders the check button and a default host", () => {
    renderWithIntl(<RobotsClient />);
    expect(screen.getByRole("button", { name: /Check/i })).toBeInTheDocument();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("github.com");
  });

  it("submits and renders robots.txt + sitemap blocks", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RobotsClient />);
    await user.click(screen.getByRole("button", { name: /Check/i }));

    expect(await screen.findByText("robots.txt")).toBeInTheDocument();
    expect(await screen.findByText(/User-agent/)).toBeInTheDocument();
    expect(await screen.findByText("Sitemaps")).toBeInTheDocument();
    // The robots.txt body and the sitemap URL block both contain "sitemap.xml"
    const matches = await screen.findAllByText(/sitemap\.xml/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the translated 'URLs' label and URL count", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RobotsClient />);
    await user.click(screen.getByRole("button", { name: /Check/i }));
    expect(await screen.findByText("42")).toBeInTheDocument();
    // The text "URLs" appears in the URL count line and inside the
    // "Sample URLs" <summary> — both are valid; just assert at least one.
    const labels = await screen.findAllByText(/URLs/);
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("expands sample URLs from <details>", async () => {
    const user = userEvent.setup();
    renderWithIntl(<RobotsClient />);
    await user.click(screen.getByRole("button", { name: /Check/i }));
    const summary = await screen.findByText(/Sample URLs/i);
    expect(summary).toBeInTheDocument();
    expect(await screen.findByText("/page-a")).toBeInTheDocument();
  });

  it("renders translated 'Beispiel-URLs' summary in German", async () => {
    const user = userEvent.setup();
    renderWithLocale(<RobotsClient />, "de");
    await user.click(screen.getByRole("button", { name: /Prüfen/i }));
    expect(await screen.findByText(/Beispiel-URLs/i)).toBeInTheDocument();
  });
});
