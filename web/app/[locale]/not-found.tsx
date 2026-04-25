"use client";

/**
 * 404 Not Found — animated, fully translated (en / de / hi / zh)
 *
 * Design:
 *  • Giant gradient "404" with continuous glow animation
 *  • Floating network-node dots scattered around edges
 *  • Faint SVG connection lines between nodes (strokeDashoffset draw animation)
 *  • Radial ambient glow behind the number
 *  • Staggered fade-in-up for headline, description, button
 *  • Subtle orbit ring around the 404
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";

// ─── Decorative network nodes ──────────────────────────────────────────────────

interface NodeDef {
  style: CSSProperties;
  size: number;
  delay: string;
  speed: "float" | "float-slow" | "float-fast";
  opacity: number;
}

const NODES: NodeDef[] = [
  { style: { top: "10%",  left:  "6%"  }, size: 10, delay: "0s",    speed: "float",      opacity: 0.55 },
  { style: { top: "22%",  right: "8%"  }, size: 7,  delay: "0.9s",  speed: "float-slow", opacity: 0.4  },
  { style: { top: "50%",  left:  "3%"  }, size: 12, delay: "1.6s",  speed: "float",      opacity: 0.5  },
  { style: { top: "68%",  right: "5%"  }, size: 8,  delay: "0.4s",  speed: "float-fast", opacity: 0.6  },
  { style: { top: "35%",  left:  "12%" }, size: 6,  delay: "1.2s",  speed: "float-slow", opacity: 0.35 },
  { style: { top: "25%",  right: "16%" }, size: 9,  delay: "2.0s",  speed: "float",      opacity: 0.45 },
  { style: { top: "80%",  left:  "16%" }, size: 7,  delay: "0.7s",  speed: "float-fast", opacity: 0.5  },
  { style: { top: "8%",   right: "22%" }, size: 5,  delay: "2.3s",  speed: "float",      opacity: 0.3  },
  { style: { top: "88%",  right: "14%" }, size: 6,  delay: "1.4s",  speed: "float-slow", opacity: 0.4  },
  { style: { top: "42%",  right: "3%"  }, size: 11, delay: "0.2s",  speed: "float",      opacity: 0.5  },
  { style: { top: "15%",  left:  "30%" }, size: 4,  delay: "1.8s",  speed: "float-fast", opacity: 0.25 },
  { style: { top: "75%",  right: "28%" }, size: 5,  delay: "0.6s",  speed: "float-slow", opacity: 0.3  },
];

// ─── SVG connection lines (percentage-based on 100×100 viewBox) ───────────────

const LINES = [
  { x1:  6, y1: 10, x2: 12, y2: 35, delay: "0s"   },
  { x1: 12, y1: 35, x2:  3, y2: 50, delay: "0.5s" },
  { x1: 84, y1: 22, x2: 97, y2: 42, delay: "1.0s" },
  { x1: 97, y1: 42, x2: 95, y2: 68, delay: "0.3s" },
  { x1:  6, y1: 10, x2: 30, y2: 15, delay: "1.5s" },
  { x1: 78, y1: 25, x2: 92, y2: 22, delay: "0.8s" },
  { x1: 16, y1: 80, x2:  3, y2: 50, delay: "1.2s" },
  { x1: 86, y1: 88, x2: 95, y2: 68, delay: "0.6s" },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function NotFound() {
  const t = useTranslations("not_found");

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden px-4">

      {/* ── Grid background ── */}
      <div className="absolute inset-0 grid-bg opacity-50" />

      {/* ── Ambient radial glow behind 404 ── */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[480px] w-[480px] animate-pulse rounded-full bg-brand/8 blur-[120px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[280px] w-[600px] animate-pulse rounded-full bg-brand/5 blur-[80px]"
             style={{ animationDelay: "1s" }} />
      </div>

      {/* ── SVG connection lines ── */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {LINES.map((l, i) => (
          <line
            key={i}
            x1={`${l.x1}%`} y1={`${l.y1}%`}
            x2={`${l.x2}%`} y2={`${l.y2}%`}
            stroke="rgba(249,115,22,0.18)"
            strokeWidth="0.3"
            strokeDasharray="200"
            strokeDashoffset="200"
            style={{
              animation: `drawLine 3.5s ease-in-out ${l.delay} infinite`,
            }}
          />
        ))}
      </svg>

      {/* ── Floating network nodes ── */}
      {NODES.map((n, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ ...n.style, opacity: n.opacity }}
        >
          {/* Outer ping ring */}
          <span
            className="absolute inline-flex rounded-full bg-brand/30 animate-ping-slow"
            style={{
              width:  n.size * 2.4,
              height: n.size * 2.4,
              top:    -n.size * 0.7,
              left:   -n.size * 0.7,
              animationDelay: n.delay,
            }}
          />
          {/* Core dot */}
          <div
            className={`relative rounded-full bg-brand animate-${n.speed} ring-1 ring-brand/40`}
            style={{
              width:          n.size,
              height:         n.size,
              animationDelay: n.delay,
              boxShadow:      `0 0 ${n.size * 2}px rgba(249,115,22,0.5)`,
            }}
          />
        </div>
      ))}

      {/* ── Main content ── */}
      <div className="relative z-10 text-center">

        {/* Orbit ring */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10">
          <div
            className="animate-spin-slow rounded-full border border-brand/10"
            style={{ width: "clamp(280px, 45vw, 460px)", height: "clamp(280px, 45vw, 460px)" }}
          />
          <div
            className="absolute rounded-full border border-brand/6"
            style={{
              width:  "clamp(340px, 55vw, 560px)",
              height: "clamp(340px, 55vw, 560px)",
              animation: "spin 20s linear infinite reverse",
            }}
          />
        </div>

        {/* 404 number */}
        <div
          className="animate-fade-in-up select-none"
          style={{ animationDelay: "0ms" }}
        >
          <span
            className="block font-black leading-none tracking-tighter animate-glow-404"
            style={{
              fontSize:           "clamp(6rem, 22vw, 16rem)",
              background:         "linear-gradient(160deg, #f97316 0%, #fb923c 40%, #fdba74 70%, #f97316 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor:  "transparent",
              backgroundClip:     "text",
            }}
          >
            {t("code")}
          </span>
        </div>

        {/* Divider line */}
        <div
          className="mx-auto mt-2 h-px animate-fade-in-up"
          style={{
            width: "clamp(80px, 12vw, 160px)",
            background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.6), transparent)",
            animationDelay: "120ms",
          }}
        />

        {/* Title */}
        <h1
          className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl animate-fade-in-up text-fg"
          style={{ animationDelay: "200ms" }}
        >
          {t("title")}
        </h1>

        {/* Description */}
        <p
          className="mt-3 max-w-md mx-auto text-base text-fg-muted animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          {t("desc")}
        </p>

        {/* Hint */}
        <p
          className="mt-2 text-sm text-fg-subtle animate-fade-in-up"
          style={{ animationDelay: "400ms" }}
        >
          {t("hint")}
        </p>

        {/* CTA button */}
        <div
          className="mt-8 animate-fade-in-up"
          style={{ animationDelay: "500ms" }}
        >
          <Link
            href="/"
            className="btn glow px-6 py-2.5 text-base font-semibold gap-2 hover:scale-105 transition-transform"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3H8v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
                clipRule="evenodd"
              />
            </svg>
            {t("back")}
          </Link>
        </div>

        {/* Search hint */}
        <p
          className="mt-6 text-xs text-fg-subtle/70 animate-fade-in-up"
          style={{ animationDelay: "650ms" }}
        >
          {t("search_hint")}
        </p>
      </div>
    </div>
  );
}
