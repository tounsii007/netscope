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
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "slide-up": "slideUp 0.3s ease-out",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 0 0 rgba(249,115,22,0.5)" },
          "50%": { opacity: "0.8", boxShadow: "0 0 0 8px rgba(249,115,22,0)" },
        },
        slideUp: { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
    },
  },
  plugins: [],
};
export default config;
