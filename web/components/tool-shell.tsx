import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Shared layout shell wrapped around every tool page. Provides a
 * consistent header (icon + title + subtitle) plus a subtle decorative
 * backdrop, and exposes a couple of building blocks (`ResultCard`,
 * `Spinner`, `LoadingButton`) used in the body of each tool.
 *
 * The header is now a small "hero card" — a glass surface with a
 * mesh-tinted backdrop and the icon sitting in a coloured chip with a
 * soft brand glow. The accent prop lets tools pick brand / cyan /
 * violet / success — matching the landing-page category accent so the
 * cross-page navigation feels cohesive.
 */
export function ToolShell({
  title, subtitle, icon, children, className, accent = "brand",
}: {
  title: string; subtitle: string; icon: React.ReactNode;
  children: React.ReactNode; className?: string;
  accent?: "brand" | "cyan" | "violet" | "success";
}) {
  // Link the <section> landmark to its <h1> via aria-labelledby. A
  // section with no accessible name reads as just "region" in the
  // screen-reader landmark list — useless when a user is trying to
  // jump between sections. Pulling the heading text in by id gives
  // each tool a distinct entry ("DNS Lookup region", "Port Checker
  // region", ...) without duplicating the string.
  //
  // useId() returns a stable cross-render id that matches between
  // SSR and hydration; safe in the server component, safe in client.
  const titleId = useId();
  const iconTone =
    accent === "cyan"
      ? "text-cyan-soft bg-cyan-brand/10 ring-cyan-brand/25"
      : accent === "violet"
        ? "text-violet-soft bg-violet-brand/10 ring-violet-brand/25"
        : accent === "success"
          ? "text-success bg-success/10 ring-success/25"
          : "text-brand bg-brand/10 ring-brand/25";
  const orbTone =
    accent === "cyan"
      ? "bg-cyan-brand"
      : accent === "violet"
        ? "bg-violet-brand"
        : accent === "success"
          ? "bg-success"
          : "bg-brand";
  return (
    <section
      aria-labelledby={titleId}
      className={cn("space-y-6 animate-slide-up", className)}
    >
      <header className="relative isolate overflow-hidden rounded-2xl border border-border bg-bg-card">
        <div aria-hidden="true" className="absolute inset-0 grid-bg opacity-50" />
        <div
          aria-hidden="true"
          className={`orb h-48 w-48 -top-12 -left-12 ${orbTone} opacity-40`}
        />
        <div className="relative flex items-start gap-4 px-5 py-5 sm:px-6 sm:py-6">
          <div
            aria-hidden="true"
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${iconTone}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <h1
              id={titleId}
              className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl"
            >
              {title}
            </h1>
            <p className="mt-1 text-sm text-fg-muted sm:text-base">{subtitle}</p>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * Standard surface for tool results — a card with a soft inner border
 * so it reads as elevated content without competing with the page bg.
 */
export function ResultCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("card", className)}>{children}</div>;
}

/**
 * Loading spinner that inherits its color from the surrounding text.
 *
 * Why `border-current`?  We previously used `border-brand` which made the
 * spinner invisible against the orange action button (`btn`) because button
 * background and spinner were the SAME color. `border-current` picks up
 * whatever `text-*` class wraps it — white on the primary button, brand on
 * ghost buttons, fg-muted on disabled states — so it's always legible.
 *
 * @param size  Tailwind size token. Defaults to 4 (16px) which matches the
 *              x-height of body text and lines up next to button labels.
 */
export function Spinner({ size = 4, className = "" }: { size?: 3 | 4 | 5 | 6; className?: string }) {
  const dim = size === 3 ? "h-3 w-3" : size === 5 ? "h-5 w-5" : size === 6 ? "h-6 w-6" : "h-4 w-4";
  // `aria-hidden` because the spinner is purely decorative — the loading
  // state is announced via the parent's `aria-busy` (LoadingButton, form,
  // etc.). Combining role="status" with aria-hidden is a common a11y
  // anti-pattern: screen readers either ignore the status (because hidden)
  // or surface it twice (once for the role, once for aria-busy). We keep
  // the visual spin and let the ancestor handle the announcement.
  //
  // `preserve-motion` exempts the spinner from the prefers-reduced-motion
  // override in globals.css so it keeps spinning even for users who've
  // asked to reduce motion — a frozen spinner reads as "broken".
  return (
    <span
      aria-hidden="true"
      className={`preserve-motion inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${dim} ${className}`}
    />
  );
}

/**
 * Drop-in replacement for the action button on every tool page. Handles the
 * three visual states uniformly so individual tools don't have to:
 *
 *   • idle      → label only
 *   • loading   → spinner + loading-label, button disabled, aria-busy=true
 *   • disabled  → label, dimmed, no pointer
 *
 * Also exposes `loadingLabel` so each tool can localise the text (e.g.
 * "Wird geprüft…", "Looking up…"), but defaults to the `common.loading` key
 * for callers that don't pass one.
 *
 * Usage:
 *   <LoadingButton loading={loading} loadingLabel={tc("loading")}>
 *     {tc("check")}
 *   </LoadingButton>
 */
export function LoadingButton({
  loading,
  loadingLabel,
  disabled,
  children,
  className = "",
  type = "submit",
  onClick,
}: {
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  type?: "submit" | "button" | "reset";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className={`btn shine-on-hover min-w-[7rem] justify-center shadow-glow-brand transition hover:shadow-[0_24px_70px_-18px_rgba(249,115,22,0.6)] ${className}`}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <Spinner />
          {loadingLabel && <span>{loadingLabel}</span>}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Empty-state placeholder for tools that have rendered the form but
 * have no result yet. Pair with the result area so the page never
 * looks half-built before the user submits. The component is purely
 * presentational — callers decide when to show it.
 */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-bg-card/40 px-6 py-10 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-bg-elevated text-fg-muted ring-1 ring-border">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{description}</p>
      )}
    </div>
  );
}
