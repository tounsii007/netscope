import { describe, it, expect, vi } from "vitest";
import Error from "@/app/[locale]/error";
import { renderWithIntl, renderWithLocale, screen, userEvent } from "./test-utils";

describe("Error boundary page", () => {
  it("renders the translated title and message in English", () => {
    const reset = vi.fn();
    const err = Object.assign(new global.Error("Boom"), { digest: "x" });
    renderWithIntl(<Error error={err} reset={reset} />);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });

  it("calls reset() when the retry button is clicked", async () => {
    const reset = vi.fn();
    const err = Object.assign(new global.Error("Oops"), { digest: "y" });
    const user = userEvent.setup();
    renderWithIntl(<Error error={err} reset={reset} />);
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders translated content in German", () => {
    const err = Object.assign(new global.Error("Fehler"), { digest: "z" });
    renderWithLocale(<Error error={err} reset={() => {}} />, "de");
    expect(screen.getByText(/Etwas ist schiefgelaufen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Erneut versuchen/i })).toBeInTheDocument();
  });
});
