import { describe, it, expect } from "vitest";
import { WhoisClient } from "@/app/[locale]/whois/client";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

describe("WhoisClient", () => {
  it("renders the lookup button and a default domain", () => {
    renderWithIntl(<WhoisClient />);
    expect(screen.getByRole("button", { name: /Lookup/i })).toBeInTheDocument();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("cloudflare.com");
  });

  it("submits and renders all WHOIS sections", async () => {
    const user = userEvent.setup();
    renderWithIntl(<WhoisClient />);
    await user.click(screen.getByRole("button", { name: /Lookup/i }));

    expect(await screen.findByText("Domain")).toBeInTheDocument();
    expect(await screen.findByText("Dates")).toBeInTheDocument();
    expect(await screen.findByText("Nameservers")).toBeInTheDocument();
    expect(await screen.findByText("Acme Registrar Inc.")).toBeInTheDocument();
    expect(await screen.findByText("ns1.acme.example")).toBeInTheDocument();
    // status badges
    expect(await screen.findByText("clientTransferProhibited")).toBeInTheDocument();
  });

  it("renders translated section headings in German", async () => {
    const user = userEvent.setup();
    renderWithLocale(<WhoisClient />, "de");
    await user.click(screen.getByRole("button", { name: /Abfragen/i }));
    expect(await screen.findByText("Domain")).toBeInTheDocument();
    expect(await screen.findByText("Datum")).toBeInTheDocument();
    expect(await screen.findByText("Nameserver")).toBeInTheDocument();
  });

  it("renders translated section headings in Chinese", async () => {
    const user = userEvent.setup();
    renderWithLocale(<WhoisClient />, "zh");
    await user.click(screen.getByRole("button", { name: /查询/ }));
    expect(await screen.findByText("域名")).toBeInTheDocument();
    expect(await screen.findByText("日期信息")).toBeInTheDocument();
    expect(await screen.findByText("域名服务器")).toBeInTheDocument();
  });
});
