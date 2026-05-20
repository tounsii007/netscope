import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0a0a0a", card: "#111111", elevated: "#161616" },
        border: { DEFAULT: "#262626", subtle: "#1a1a1a" },
        fg: { DEFAULT: "#fafafa", muted: "#a1a1aa", subtle: "#71717a" },
        brand: { DEFAULT: "#f97316", hover: "#ea580c", soft: "#fb923c" },
        cyan: { brand: "#06b6d4", soft: "#22d3ee" },
        violet: { brand: "#a855f7", soft: "#c084fc" },
        success: "#10b981",
        danger: "#ef4444",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "mesh-1":
          "radial-gradient(at 18% 12%, rgba(249,115,22,0.32) 0px, transparent 50%), radial-gradient(at 82% 18%, rgba(168,85,247,0.22) 0px, transparent 50%), radial-gradient(at 50% 90%, rgba(6,182,212,0.22) 0px, transparent 50%)",
        "mesh-2":
          "radial-gradient(at 78% 22%, rgba(249,115,22,0.18) 0px, transparent 55%), radial-gradient(at 14% 76%, rgba(6,182,212,0.18) 0px, transparent 55%)",
        "shine":
          "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.08) 50%, transparent 75%)",
        "brand-grad":
          "linear-gradient(135deg, #f97316 0%, #fb923c 50%, #f59e0b 100%)",
        "cyan-grad":
          "linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%)",
        "violet-grad":
          "linear-gradient(135deg, #a855f7 0%, #c084fc 100%)",
      },
      boxShadow: {
        "glow-brand": "0 20px 60px -20px rgba(249,115,22,0.45)",
        "glow-cyan": "0 20px 60px -20px rgba(6,182,212,0.45)",
        "glow-violet": "0 20px 60px -20px rgba(168,85,247,0.45)",
        "inset-border": "inset 0 0 0 1px rgba(255,255,255,0.06)",
      },
      animation: {
        "pulse-glow":   "pulseGlow 2s ease-in-out infinite",
        "slide-up":     "slideUp 0.3s ease-out",
        "fade-in-up":   "fadeInUp 0.7s ease-out both",
        "float":        "float 4s ease-in-out infinite",
        "float-slow":   "float 6s ease-in-out infinite",
        "float-fast":   "float 2.8s ease-in-out infinite",
        "spin-slow":    "spin 12s linear infinite",
        "ping-slow":    "ping 2.5s cubic-bezier(0,0,0.2,1) infinite",
        "glow-404":     "glow404 3s ease-in-out infinite",
        "draw-line":    "drawLine 2s ease-in-out infinite",
        "mesh-shift":   "meshShift 18s ease-in-out infinite",
        "orb":          "orbFloat 14s ease-in-out infinite",
        "shine":        "shine 3.5s linear infinite",
        "rise":         "rise 0.8s cubic-bezier(0.16,1,0.3,1) both",
        "marquee":      "marquee 30s linear infinite",
        "gradient-x":   "gradientX 8s ease infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(249,115,22,0.5)" },
          "50%":      { opacity: "0.8", boxShadow: "0 0 0 8px rgba(249,115,22,0)" },
        },
        slideUp: {
          from: { transform: "translateY(8px)", opacity: "0" },
          to:   { transform: "translateY(0)",   opacity: "1" },
        },
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(24px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px) scale(1)" },
          "50%":      { transform: "translateY(-14px) scale(1.05)" },
        },
        glow404: {
          "0%, 100%": {
            textShadow: "0 0 40px rgba(249,115,22,0.4), 0 0 80px rgba(249,115,22,0.2)",
            filter: "brightness(1)",
          },
          "50%": {
            textShadow: "0 0 80px rgba(249,115,22,0.8), 0 0 140px rgba(249,115,22,0.4)",
            filter: "brightness(1.15)",
          },
        },
        drawLine: {
          "0%":   { strokeDashoffset: "200" },
          "50%":  { strokeDashoffset: "0" },
          "100%": { strokeDashoffset: "-200" },
        },
        meshShift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "33%":      { transform: "translate3d(2%, -2%, 0) scale(1.05)" },
          "66%":      { transform: "translate3d(-2%, 2%, 0) scale(0.95)" },
        },
        orbFloat: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "25%":      { transform: "translate3d(40px, -30px, 0)" },
          "50%":      { transform: "translate3d(-20px, 20px, 0)" },
          "75%":      { transform: "translate3d(30px, 40px, 0)" },
        },
        shine: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(28px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        gradientX: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%":      { backgroundPosition: "100% 50%" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
