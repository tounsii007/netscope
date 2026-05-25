"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Floating "scroll back to top" button. Fades in once the user
 * scrolls past 600 px and disappears below that threshold. Smooth-
 * scrolls to the top on click (or jumps if reduce-motion is set).
 *
 * Anchored bottom-right with safe-area inset so it doesn't collide
 * with iOS Safari's home indicator.
 */
export function BackToTop() {
  const [show, setShow] = useState(false);
  const t = useTranslations("common");

  useEffect(() => {
    function onScroll() {
      setShow(window.scrollY > 600);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function scrollUp() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <button
      type="button"
      onClick={scrollUp}
      aria-label={t("back_to_top")}
      className={`fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg-card/85 text-fg-muted shadow-lg backdrop-blur transition hover:border-brand/40 hover:text-fg hover:shadow-glow-brand sm:bottom-7 sm:right-7 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
      }`}
      style={{
        // Respect iOS safe-area
        marginBottom: "env(safe-area-inset-bottom, 0px)",
        marginRight:  "env(safe-area-inset-right, 0px)",
      }}
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
