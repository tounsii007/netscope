import { describe, it, expect } from "vitest";
import { renderWithIntl, screen } from "./test-utils";
import { DetailedRecordList } from "@/app/[locale]/dns-lookup/detailed-record-list";
import type { DnsRecordDetail } from "@/lib/api";

describe("DetailedRecordList — type-aware DNS rendering", () => {
  it("MX list sorts by preference and renders priority chips + exchange host", () => {
    const entries: DnsRecordDetail[] = [
      { value: "30 c.example.com.", ttl: 300, dnsClass: "IN", preference: 30, exchange: "c.example.com." },
      { value: "10 a.example.com.", ttl: 300, dnsClass: "IN", preference: 10, exchange: "a.example.com." },
      { value: "20 b.example.com.", ttl: 300, dnsClass: "IN", preference: 20, exchange: "b.example.com." },
    ];
    renderWithIntl(<DetailedRecordList type="MX" entries={entries} />);

    const items = screen.getAllByRole("listitem");
    // Sorted ascending by preference — first item should be the "10" priority
    expect(items[0].textContent).toMatch(/10.*a\.example\.com/);
    expect(items[1].textContent).toMatch(/20.*b\.example\.com/);
    expect(items[2].textContent).toMatch(/30.*c\.example\.com/);
  });

  it("SOA renders the full seven-field grid in a single panel", () => {
    const entries: DnsRecordDetail[] = [
      {
        value: "ns1.example.com. admin.example.com. 2024010100 3600 600 86400 60",
        ttl: 86400,
        dnsClass: "IN",
        primaryNs: "ns1.example.com.",
        adminEmail: "admin.example.com.",
        serial: 2024010100,
        refresh: 3600,
        retry: 600,
        expire: 86400,
        minimum: 60,
      },
    ];
    renderWithIntl(<DetailedRecordList type="SOA" entries={entries} />);

    expect(screen.getByText(/Primary NS/i)).toBeInTheDocument();
    expect(screen.getByText("ns1.example.com.")).toBeInTheDocument();
    expect(screen.getByText("2024010100")).toBeInTheDocument();
    // Refresh 3 600s should humanise to "1h"
    expect(screen.getByText(/Refresh/i).parentElement?.textContent).toMatch(/1h/);
    // Expire 86 400s should humanise to "1d"
    expect(screen.getByText(/Expire/i).parentElement?.textContent).toMatch(/1d/);
  });

  it("CAA renders flags + tag chip + value separately", () => {
    const entries: DnsRecordDetail[] = [
      {
        value: "0 issue \"letsencrypt.org\"",
        ttl: 300,
        dnsClass: "IN",
        flags: 0,
        tag: "issue",
        caaValue: "letsencrypt.org",
      },
    ];
    renderWithIntl(<DetailedRecordList type="CAA" entries={entries} />);

    expect(screen.getByText("issue")).toBeInTheDocument();
    expect(screen.getByText("letsencrypt.org")).toBeInTheDocument();
    expect(screen.getByText(/flags=0/)).toBeInTheDocument();
  });

  it("A records show TTL chip with humanised seconds", () => {
    const entries: DnsRecordDetail[] = [
      { value: "93.184.216.34", ttl: 7200, dnsClass: "IN" },
    ];
    renderWithIntl(<DetailedRecordList type="A" entries={entries} />);

    expect(screen.getByText("93.184.216.34")).toBeInTheDocument();
    // 7 200s should humanise to "2h"
    expect(screen.getByText(/TTL\s+2h/i)).toBeInTheDocument();
  });

  it("TTL under 60s falls back to '{n}s' instead of humanising", () => {
    const entries: DnsRecordDetail[] = [
      { value: "93.184.216.34", ttl: 30, dnsClass: "IN" },
    ];
    renderWithIntl(<DetailedRecordList type="A" entries={entries} />);
    expect(screen.getByText(/TTL\s+30s/i)).toBeInTheDocument();
  });

  it("MX with no preference still renders gracefully", () => {
    const entries: DnsRecordDetail[] = [
      { value: "mail.example.com.", ttl: 300, dnsClass: "IN", exchange: "mail.example.com." },
    ];
    renderWithIntl(<DetailedRecordList type="MX" entries={entries} />);
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("mail.example.com.")).toBeInTheDocument();
  });
});
