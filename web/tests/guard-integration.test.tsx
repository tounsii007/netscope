import { describe, it, expect } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithIntl, screen } from "./test-utils";
import { DnsClient } from "@/app/[locale]/dns-lookup/client";
import { PortCheckerClient } from "@/app/[locale]/port-checker/client";
import { SslClient } from "@/app/[locale]/ssl-check/client";

/**
 * End-to-end check that the four target-facing tools (DNS, Port, SSL,
 * IP — IP is covered separately because it owns its own normaliser
 * pipeline) reject localhost/private/metadata input *before* hitting
 * the API.
 *
 * The failure mode we're guarding against: a user types `localhost`
 * (or `127.0.0.1`, or any RFC-1918 host) into a public diagnostic
 * tool, the form happily POSTs to the backend, the backend rejects
 * with a generic 403, and the UI shows the unhelpful "forbidden"
 * message. The new guard short-circuits client-side with a precise,
 * localised error.
 */

describe("target-guard integration — DNS/Port/SSL forms", () => {
  it("DNS lookup blocks 'localhost' with the localhost message", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DnsClient />);
    const input = screen.getByLabelText(/enter domain/i);
    await user.clear(input);
    await user.type(input, "localhost");
    await user.click(screen.getByRole("button", { name: /lookup/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/loopback|localhost/i);
  });

  it("DNS lookup blocks '127.0.0.1' with the localhost message", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DnsClient />);
    const input = screen.getByLabelText(/enter domain/i);
    await user.clear(input);
    await user.type(input, "127.0.0.1");
    await user.click(screen.getByRole("button", { name: /lookup/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/loopback|localhost/i);
  });

  it("DNS lookup blocks an RFC 1918 IP with the private-network message", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DnsClient />);
    const input = screen.getByLabelText(/enter domain/i);
    await user.clear(input);
    await user.type(input, "10.0.0.1");
    await user.click(screen.getByRole("button", { name: /lookup/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/private|RFC ?1918/i);
  });

  it("DNS lookup blocks a .local mDNS name with the reserved-TLD message", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DnsClient />);
    const input = screen.getByLabelText(/enter domain/i);
    await user.clear(input);
    await user.type(input, "router.local");
    await user.click(screen.getByRole("button", { name: /lookup/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/reserved|publicly/i);
  });

  it("Port checker blocks 'localhost' before posting to /api/v1/port/check", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);
    const input = screen.getByLabelText(/enter hostname/i);
    await user.clear(input);
    await user.type(input, "localhost");
    await user.click(screen.getByRole("button", { name: /check/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/loopback|localhost/i);
  });

  it("Port checker blocks the AWS IMDS metadata IP with the metadata message", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PortCheckerClient />);
    const input = screen.getByLabelText(/enter hostname/i);
    await user.clear(input);
    await user.type(input, "169.254.169.254");
    await user.click(screen.getByRole("button", { name: /check/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/metadata|safety/i);
  });

  it("SSL inspector blocks 'localhost' with the localhost message", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SslClient />);
    const input = screen.getByLabelText(/enter hostname/i);
    await user.clear(input);
    await user.type(input, "localhost");
    await user.click(screen.getByRole("button", { name: /inspect/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/loopback|localhost/i);
  });
});
