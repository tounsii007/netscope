import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Search, Network } from "lucide-react";
import en from "@/messages/en.json";
import de from "@/messages/de.json";

import { ToolCard } from "@/components/home/tool-card";
import { CategorySection } from "@/components/home/category-section";
import { renderWithIntl, screen } from "./test-utils";

/**
 * Coverage for the new landing-page primitives. The pure presentation
 * pieces (ToolCard, CategorySection) can be rendered directly. The
 * async server-component sections (Hero, FeaturesStrip, CtaBanner) are
 * tested via the same await-then-render pattern used in
 * `not-found.test.tsx`.
 */

const localeRef = { current: "en" as "en" | "de" };
const messages: Record<string, Record<string, unknown>> = { en, de };

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl/server")>(
    "next-intl/server"
  );
  return {
    ...actual,
    getTranslations: async (arg: { locale?: string; namespace?: string } | string) => {
      const ns = typeof arg === "string" ? arg : arg.namespace ?? "";
      const root = (messages[localeRef.current] as Record<string, unknown>) ?? {};
      const sub = ns.split(".").reduce<unknown>(
        (acc, k) => (acc as Record<string, unknown>)?.[k],
        root,
      ) as Record<string, string> | undefined;
      const fn = (key: string, vars?: Record<string, unknown>) => {
        const raw = sub?.[key] ?? key;
        if (typeof raw !== "string") return key;
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ""));
      };
      return fn;
    },
  };
});

beforeEach(() => {
  localeRef.current = "en";
});

describe("ToolCard", () => {
  it("renders the title, description and icon link", () => {
    renderWithIntl(
      <ToolCard
        href="/port-checker"
        title="Port Checker"
        desc="Check ports"
        icon={Network}
        accent="brand"
      />,
    );
    const link = screen.getByRole("link", { name: /Port Checker/i });
    expect(link).toHaveAttribute("href", "/port-checker");
    expect(screen.getByText("Check ports")).toBeInTheDocument();
  });

  it("applies the right accent classes for cyan", () => {
    const { container } = renderWithIntl(
      <ToolCard
        href="/dns-lookup"
        title="DNS"
        desc="Resolve"
        icon={Search}
        accent="cyan"
      />,
    );
    // The icon-wrapper carries the accent tint — `cyan-brand` shows up in its bg.
    expect(container.innerHTML).toMatch(/cyan-brand/);
  });

  it("falls back to brand accent when prop omitted", () => {
    const { container } = renderWithIntl(
      <ToolCard href="/x" title="X" desc="d" icon={Network} />,
    );
    expect(container.innerHTML).toMatch(/text-brand/);
  });
});

describe("CategorySection", () => {
  const tools = [
    { href: "/port-checker", title: "Port Checker", desc: "TCP ports", icon: Network },
    { href: "/dns-lookup",   title: "DNS Lookup",   desc: "Resolve A/AAAA", icon: Search },
  ];

  it("renders the section heading and caption", () => {
    renderWithIntl(
      <CategorySection
        title="Network"
        caption="Ports, IPs, routing"
        accent="brand"
        tools={tools}
        icon={Network}
      />,
    );
    expect(screen.getByRole("heading", { name: "Network" })).toBeInTheDocument();
    expect(screen.getByText("Ports, IPs, routing")).toBeInTheDocument();
  });

  it("renders one ToolCard per tool", () => {
    renderWithIntl(
      <CategorySection
        title="Network"
        caption="caption"
        accent="brand"
        tools={tools}
        icon={Network}
      />,
    );
    expect(screen.getByRole("link", { name: /Port Checker/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DNS Lookup/i })).toBeInTheDocument();
  });
});

// Async server components — we await the JSX tree then hand it to RTL.
describe("HomeHero (server)", () => {
  it("renders title, badge and primary CTA", async () => {
    const { HomeHero } = await import("@/components/home/hero");
    const tree = await HomeHero();
    const { getByRole } = render(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        {tree}
      </NextIntlClientProvider>,
    );
    // The hero title splits across two spans; querying by role works.
    expect(getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(getByRole("link", { name: /Try the tools/i })).toHaveAttribute(
      "href",
      "/port-checker",
    );
    expect(getByRole("link", { name: /Open dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});

describe("FeaturesStrip (server)", () => {
  it("renders four feature articles", async () => {
    const { FeaturesStrip } = await import("@/components/home/features-strip");
    const tree = await FeaturesStrip();
    const { getAllByRole, getByText } = render(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        {tree}
      </NextIntlClientProvider>,
    );
    expect(getAllByRole("article")).toHaveLength(4);
    expect(getByText(/Built for speed/i)).toBeInTheDocument();
    expect(getByText(/Privacy first/i)).toBeInTheDocument();
  });
});

describe("CtaBanner (server)", () => {
  it("renders the title and two CTAs", async () => {
    const { CtaBanner } = await import("@/components/home/cta-banner");
    const tree = await CtaBanner();
    const { getByRole } = render(
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        {tree}
      </NextIntlClientProvider>,
    );
    expect(getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(getByRole("link", { name: /Open dashboard/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(getByRole("link", { name: /View status/i })).toHaveAttribute(
      "href",
      "/status",
    );
  });
});
