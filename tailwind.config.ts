import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backed por CSS vars para soportar dark mode sin reescribir las ~300
        // clases existentes. El patrón rgb(var(--x) / <alpha-value>) preserva
        // los modificadores de opacidad (text-navy/75, bg-paper-light, etc.).
        paper: {
          DEFAULT: "rgb(var(--c-paper) / <alpha-value>)",
          light: "rgb(var(--c-paper-light) / <alpha-value>)",
          dark: "rgb(var(--c-paper-dark) / <alpha-value>)",
        },
        navy: {
          DEFAULT: "rgb(var(--c-navy) / <alpha-value>)",
          soft: "rgb(var(--c-navy-soft) / <alpha-value>)",
          muted: "rgb(var(--c-navy-muted) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--c-gold) / <alpha-value>)",
          soft: "rgb(var(--c-gold-soft) / <alpha-value>)",
          deep: "rgb(var(--c-gold-deep) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--c-line) / <alpha-value>)",
          strong: "rgb(var(--c-line-strong) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Tipografía fluid: escala con el viewport entre mobile y desktop.
        // clamp(min, preferred, max)
        "display": ["clamp(1.875rem, 5vw, 2.75rem)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "400" }],
        "h1": ["clamp(1.5rem, 3.5vw, 2.125rem)", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "400" }],
        "h2": ["clamp(1.25rem, 2.5vw, 1.5rem)", { lineHeight: "1.25", letterSpacing: "-0.01em", fontWeight: "500" }],
        "eyebrow": ["0.75rem", { lineHeight: "1", letterSpacing: "0.18em", fontWeight: "500" }],
        "kpi": ["clamp(1.5rem, 4vw, 2rem)", { lineHeight: "1", letterSpacing: "-0.01em", fontWeight: "400" }],
        "kpi-lg": ["clamp(2rem, 5vw, 2.75rem)", { lineHeight: "1", letterSpacing: "-0.015em", fontWeight: "400" }],
      },
      borderWidth: {
        hairline: "0.5px",
      },
      backgroundImage: {
        "paper-grain": "url('/textures/paper.svg')",
        "cement": "url('/textures/cement.svg')",
      },
      spacing: {
        // Ritmo vertical compacto: las páginas cortas entran sin scroll.
        "section": "2.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
