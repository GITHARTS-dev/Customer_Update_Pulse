import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Cool violet-grey canvas - blended from Evora (violet) + HARTS neutrals
        sand: {
          50: "#F7F6FC",
          100: "#F0EEF8",
          200: "#E5E2F1",
          300: "#D0CBE2"
        },
        cream: "#FCFBFF",
        ink: {
          900: "#1B1830",
          800: "#2A2640",
          700: "#3C3757",
          500: "#6C6689",
          400: "#948FAB",
          300: "#B6B1C8"
        },
        // Primary accent is per-customer, driven by the --accent CSS variable
        // (RGB channels) set on each customer's layout wrapper. Defined this way
        // so opacity utilities (bg-coral/10, focus:ring-coral/40, …) keep working.
        // "coral" and "violet" are aliases so the whole existing UI re-themes.
        coral: "rgb(var(--accent) / <alpha-value>)",
        violet: "rgb(var(--accent) / <alpha-value>)",
        // Sentiment = the HARTS rainbow (green / gold / red / blue)
        leaf: "#3BA46A",
        amber: "#E8A020",
        crimson: "#D6473F",
        slate: "#3E8FCF"
      },
      fontFamily: {
        // DM Sans everywhere - the loaded webfont via next/font's CSS variable,
        // falling back to the system sans stack. "serif" is kept as a key (many
        // headings still use `font-serif`) but now resolves to DM Sans too, so
        // the whole UI is one typeface.
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-dm-sans)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 2px rgba(60, 50, 40, 0.04), 0 4px 16px rgba(60, 50, 40, 0.05)",
        hero: "0 8px 30px rgba(20, 16, 12, 0.18)"
      },
      borderRadius: {
        card: "20px"
      }
    }
  },
  plugins: []
};

export default config;
