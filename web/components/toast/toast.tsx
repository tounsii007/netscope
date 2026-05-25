"use client";

import {
  createContext, useCallback, useContext, useRef, useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export interface ToastInput {
  message: string;
  kind?: ToastKind;
  /** ms before auto-dismiss. 0 disables auto-dismiss. */
  duration?: number;
}

interface Toast extends Required<Omit<ToastInput, "duration">> {
  id: number;
  duration: number;
}

interface ToastContextValue {
  /** Push a new toast onto the stack. */
  show: (t: ToastInput) => void;
  /** Convenience: success-kind toast. */
  success: (message: string, duration?: number) => void;
  /** Convenience: error-kind toast. */
  error: (message: string, duration?: number) => void;
  /** Dismiss a toast by id. */
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastContextValue | null>(null);

/**
 * Tiny in-memory toast system. One provider mounted at the root of the
 * locale layout gives every descendant access to `useToast()` for
 * "copied to clipboard" / "saved" / "error" feedback.
 *
 * Visual treatment:
 *   • slides up from the bottom-right corner (safe-area aware on iOS)
 *   • each toast is a glass card with a coloured icon chip
 *   • dismisses automatically after `duration` ms (default 3000)
 *   • announces via `role="status"` + `aria-live="polite"` so screen
 *     readers pick up the message without interrupting the user
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  // Reduced-motion users get the same toast but with a tiny entrance.
  // (Animations themselves are gated by globals.css.)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      idRef.current += 1;
      const id = idRef.current;
      const toast: Toast = {
        id,
        message: input.message,
        kind: input.kind ?? "info",
        duration: input.duration ?? 3000,
      };
      setToasts((current) => [...current, toast]);
      if (toast.duration > 0) {
        window.setTimeout(() => dismiss(id), toast.duration);
      }
    },
    [dismiss],
  );

  const success = useCallback(
    (message: string, duration?: number) => show({ message, kind: "success", duration }),
    [show],
  );
  const error = useCallback(
    (message: string, duration?: number) =>
      show({ message, kind: "error", duration: duration ?? 5000 }),
    [show],
  );

  return (
    <Ctx.Provider value={{ show, success, error, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </Ctx.Provider>
  );
}

/**
 * Hook for components inside ToastProvider to push notifications.
 * Throws when called outside the provider so missing setup fails
 * loudly instead of silently no-op-ing.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

function ToastViewport({
  toasts,
  dismiss,
}: {
  toasts: Toast[];
  dismiss: (id: number) => void;
}) {
  // We keep the viewport mounted even when empty so screen readers
  // attach to the live region once instead of re-attaching every time
  // a toast appears.
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      role="status"
      className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[calc(100vw-2.5rem)] max-w-sm flex-col gap-2 sm:bottom-7 sm:right-7"
      style={{
        marginBottom: "env(safe-area-inset-bottom, 0px)",
        marginRight:  "env(safe-area-inset-right, 0px)",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const tone =
    toast.kind === "success"
      ? "border-success/40 bg-success/10 ring-success/20 text-success"
      : toast.kind === "error"
        ? "border-danger/40 bg-danger/10 ring-danger/20 text-danger"
        : "border-cyan-brand/40 bg-cyan-brand/10 ring-cyan-brand/20 text-cyan-soft";
  const Icon =
    toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? AlertCircle : Info;
  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-bg-card/90 px-3.5 py-3 shadow-2xl ring-1 backdrop-blur-xl animate-fade-in-up ${tone}`}
      style={{ animationDuration: "220ms" }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm text-fg">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded-md p-1 text-fg-subtle transition hover:bg-bg-elevated hover:text-fg"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Helper: copy text to the clipboard and fire a toast on success/error.
 * Returns the boolean result so callers can short-circuit on failure
 * if they want different behaviour beyond the toast.
 */
export async function copyWithToast(
  text: string,
  toast: ToastContextValue,
  labels: { ok: string; fail: string },
): Promise<boolean> {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    toast.success(labels.ok);
    return true;
  } catch {
    toast.error(labels.fail);
    return false;
  }
}

export const __TOAST_VERSION = 1 as const;
