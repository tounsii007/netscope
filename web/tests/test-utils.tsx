/**
 * Shared test utilities for the NetScope web suite.
 *
 *  • renderWithIntl(ui)     — wraps the component in a NextIntlClientProvider
 *                             pre-loaded with the en.json messages bundle, so
 *                             useTranslations() resolves real strings instead
 *                             of throwing "MISSING_MESSAGE".
 *  • renderWithLocale(ui, l) — same, but lets you choose en | de | hi | zh.
 *
 *  Both wrappers also include a ToastProvider so any component that calls
 *  `useToast()` — directly or through helpers like `copyWithToast` — gets
 *  a real context and doesn't throw. This mirrors the production layout
 *  which always mounts a ToastProvider at the root of [locale]/.
 */

import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "@/messages/en.json";
import de from "@/messages/de.json";
import hi from "@/messages/hi.json";
import zh from "@/messages/zh.json";

import { ToastProvider } from "@/components/toast/toast";

export const MESSAGES = { en, de, hi, zh } as const;
export type Locale = keyof typeof MESSAGES;

export function renderWithIntl(ui: ReactElement, opts?: RenderOptions) {
  return renderWithLocale(ui, "en", opts);
}

export function renderWithLocale(ui: ReactElement, locale: Locale, opts?: RenderOptions) {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
    opts,
  );
}

// Re-export the most common Testing Library helpers so tests don't have to
// import from two places.
export { screen, fireEvent, waitFor, within } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
