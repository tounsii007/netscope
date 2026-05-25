import { describe, it, expect } from "vitest";
import { Cog } from "lucide-react";
import { ExplainerColumn } from "@/components/tool-explainer/explainer-column";
import { renderWithIntl, screen } from "./test-utils";

describe("ExplainerColumn", () => {
  it("renders the heading, icon and every bullet", () => {
    renderWithIntl(
      <ExplainerColumn
        accent="brand"
        icon={<Cog data-testid="icon" />}
        heading="How it works"
        bullets={["First step", "Second step", "Third step"]}
      />,
    );
    expect(screen.getByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("First step")).toBeInTheDocument();
    expect(screen.getByText("Second step")).toBeInTheDocument();
    expect(screen.getByText("Third step")).toBeInTheDocument();
  });

  it("uses the success accent gradient bar when accent is success", () => {
    const { container } = renderWithIntl(
      <ExplainerColumn
        accent="success"
        icon={<Cog />}
        heading="When"
        bullets={["A"]}
      />,
    );
    expect(container.innerHTML).toMatch(/from-success/);
  });

  it("uses the warn accent when accent is warn", () => {
    const { container } = renderWithIntl(
      <ExplainerColumn
        accent="warn"
        icon={<Cog />}
        heading="Limits"
        bullets={["A"]}
      />,
    );
    expect(container.innerHTML).toMatch(/from-warn/);
  });

  it("defaults to brand accent when accent is omitted", () => {
    const { container } = renderWithIntl(
      <ExplainerColumn icon={<Cog />} heading="Default" bullets={["A"]} />,
    );
    expect(container.innerHTML).toMatch(/from-brand/);
  });
});
