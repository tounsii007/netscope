import { describe, it, expect } from "vitest";
import NotFound from "@/app/[locale]/not-found";
import { renderWithIntl, renderWithLocale, screen } from "./test-utils";

describe("NotFound page", () => {
  it("renders the 404 number and back-home link in English", () => {
    renderWithIntl(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back home/i })).toHaveAttribute("href", "/");
  });

  it("renders the description and search hint", () => {
    renderWithIntl(<NotFound />);
    expect(screen.getByText(/doesn't exist or has been moved/i)).toBeInTheDocument();
    expect(screen.getByText(/Looking for a tool/i)).toBeInTheDocument();
  });

  it("renders translated content in German", () => {
    renderWithLocale(<NotFound />, "de");
    expect(screen.getByText(/Seite nicht gefunden/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Zur Startseite/i })).toBeInTheDocument();
  });

  it("renders translated content in Hindi", () => {
    renderWithLocale(<NotFound />, "hi");
    expect(screen.getByText(/पृष्ठ नहीं मिला/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /होम पर जाएं/ })).toBeInTheDocument();
  });

  it("renders translated content in Chinese", () => {
    renderWithLocale(<NotFound />, "zh");
    expect(screen.getByText(/页面未找到/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回首页/ })).toBeInTheDocument();
  });
});
