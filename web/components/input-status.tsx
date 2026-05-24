"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ValidationResult } from "@/lib/input-validators";

/**
 * Tiny status pill rendered next to a form input as the user types.
 * Hidden while the input is empty; shows ✓ green when valid, ⓘ red
 * with a hint when malformed. Pure presentational — the caller runs
 * the validator and passes the result in.
 *
 * Designed to be cheap enough to mount on every keystroke. No layout
 * shift: the wrapper always reserves the same vertical space via
 * `min-h` so the form doesn't jump as the status changes.
 */
export function InputStatus({
  result,
  className = "",
}: {
  result: ValidationResult;
  className?: string;
}) {
  if (result.status === "empty") {
    // Reserve the same vertical space so the surrounding layout
    // doesn't reflow when the user starts typing. Using min-h instead
    // of fixed height keeps multi-line hints possible.
    return <div className={`min-h-[18px] ${className}`} aria-hidden="true" />;
  }
  if (result.status === "valid") {
    return (
      <p
        className={`inline-flex items-center gap-1 text-[11px] text-success ${className}`}
        role="status"
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">Valid input</span>
      </p>
    );
  }
  return (
    // role="status" not "alert" — this is a PASSIVE shape hint as the
    // user types, not a submit-time error event. Using "alert" caused
    // testing-library's getByRole("alert") to find two matches when a
    // real submit-time error was already on screen. The screen reader
    // still picks the message up via aria-live="polite" implicit on
    // role="status".
    <p
      className={`inline-flex items-center gap-1 text-[11px] text-danger ${className}`}
      role="status"
    >
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      <span>{result.hint ?? "invalid"}</span>
    </p>
  );
}
