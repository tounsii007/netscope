"use client";

import { useEffect, useState } from "react";

/**
 * Hairline progress bar fixed at the very top of the viewport. The
 * gradient fill grows from 0 → 100 % as the user scrolls the
 * document body. Pure visual — `aria-hidden` so screen readers
 * don't announce it.
 *
 * The bar sits ABOVE the sticky nav (z-50 vs nav's z-40) so it
 * stays visible while the user scrolls. Width is animated via
 * transform:scaleX instead of width to keep the paint cheap.
 *
 * Hidden when reduce-motion is preferred — the bar's whole purpose
 * is movement; a static stripe at the top of the screen is
 * confusing rather than helpful.
 */
export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVisible(false);
      return;
    }

    function update() {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        setProgress(0);
        return;
      }
      const pct = Math.min(100, Math.max(0, (window.scrollY / docHeight) * 100));
      setProgress(pct);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left"
    >
      <div
        className="h-full bg-gradient-to-r from-brand via-violet-brand to-cyan-brand origin-left transition-transform duration-75 ease-out"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
