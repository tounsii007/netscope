import { cn } from "@/lib/cn";

export function ToolShell({
  title, subtitle, icon, children, className,
}: {
  title: string; subtitle: string; icon: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("space-y-6 animate-slide-up", className)}>
      <header className="flex items-start gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
          {icon}
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-fg-muted">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

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
  // `preserve-motion` exempts the spinner from the prefers-reduced-motion
  // override in globals.css so it keeps spinning even for users who've
  // asked to reduce motion — a frozen spinner reads as "broken".
  return (
    <span
      role="status"
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
      className={`btn min-w-[7rem] justify-center ${className}`}
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
