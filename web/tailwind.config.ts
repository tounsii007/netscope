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
        brand: { DEFAULT: "#f97316", hover: "#ea580c" },
        success: "#10b981",
        danger: "#ef4444",
        warn: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
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
      },
    },
  },
  plugins: [],
};
export default config;
