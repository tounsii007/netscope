import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PortCheckerClient } from "@/app/[locale]/port-checker/client";

describe("PortCheckerClient", () => {
  it("renders modes", () => {
    render(<PortCheckerClient />);
    expect(screen.getByRole("button", { name: /Check/i })).toBeInTheDocument();
    expect(screen.getByText(/Single port/i)).toBeInTheDocument();
    expect(screen.getByText(/Common ports/i)).toBeInTheDocument();
    expect(screen.getByText(/Port range/i)).toBeInTheDocument();
  });

  it("submits a single port check and shows OPEN", async () => {
    const user = userEvent.setup();
    render(<PortCheckerClient />);
    await user.click(screen.getByRole("button", { name: /Check/i }));
    expect(await screen.findByText(/OPEN/i)).toBeInTheDocument();
    expect(await screen.findByText(/https/i)).toBeInTheDocument();
  });
});
