import { describe, it, expect } from "vitest";
import { PortCheckerClient } from "@/app/[locale]/port-checker/client";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

describe("PortCheckerClient", () => {
  it("renders all three modes", () => {
    renderWithIntl(<PortCheckerClient />);
    expect(screen.getByRole("button", { name: /Check/i })).toBeInTheDocument();
    expect(screen.getByText(/Single port/i)).toBeInTheDocument();
    expect(screen.getByText(/Common ports/i)).toBeInTheDocument();
    expect(screen.getByText(/Port range/i)).toBeInTheDocument();
  });

  it("renders a default host placeholder", () => {
    renderWithIntl(<PortCheckerClient />);
    const input = screen.getByPlaceholderText(/example\.com or IP/i) as HTMLInputElement;
    expect(input.value).toBe("google.com");
  });

  it("submits a single port check and shows OPEN with rich-text formatting", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);
    await user.click(screen.getByRole("button", { name: /Check/i }));
    expect(await screen.findByText(/OPEN/i)).toBeInTheDocument();
    expect(await screen.findByText(/https/i)).toBeInTheDocument();
    expect(await screen.findByText(/Port 443 is/i)).toBeInTheDocument();
  });

  it("switches to common ports and renders the count", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);
    await user.click(screen.getByRole("button", { name: /Common ports/i }));
    expect(await screen.findByText(/20 common ports/i)).toBeInTheDocument();
  });

  it("renders the port-range fields when range mode is selected", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);
    await user.click(screen.getByRole("button", { name: /Port range/i }));
    const inputs = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe("20");
    expect(inputs[1].value).toBe("100");
  });

  it("renders translated labels in German", () => {
    renderWithLocale(<PortCheckerClient />, "de");
    expect(screen.getByText(/Einzelner Port/i)).toBeInTheDocument();
    expect(screen.getByText(/Gängige Ports/i)).toBeInTheDocument();
    expect(screen.getByText(/Port-Bereich/i)).toBeInTheDocument();
  });

  it("renders translated labels in Chinese", () => {
    renderWithLocale(<PortCheckerClient />, "zh");
    expect(screen.getByText(/单个端口/)).toBeInTheDocument();
    expect(screen.getByText(/常用端口/)).toBeInTheDocument();
    expect(screen.getByText(/端口范围/)).toBeInTheDocument();
  });
});
