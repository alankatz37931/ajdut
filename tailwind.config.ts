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
        paper: {
          DEFAULT: "#F5F3EE",
          light: "#FAF8F3",
          dark: "#EDE9E0",
        },
        navy: {
          DEFAULT: "#1A1A2E",
          soft: "#2A2A3F",
          muted: "#4B4B5E",
        },
        gold: {
          DEFAULT: "#C8A96E",
          soft: "#D9BE85",
          deep: "#A88B54",
        },
        line: {
          DEFAULT: "#E8E3D9",
          strong: "#D6CFC0",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Tipografía fluid: escala con el viewport entre mobile y desktop.
        // clamp(min, preferred, max)
        "display": ["clamp(2.25rem, 8vw, 4rem)", { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "400" }],
        "h1": ["clamp(1.875rem, 6vw, 3rem)", { lineHeight: "1.1", letterSpacing: "-0.015em", fontWeight: "400" }],
        "h2": ["clamp(1.375rem, 3.5vw, 1.75rem)", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "500" }],
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
        "section": "5rem",
      },
    },
  },
  plugins: [],
};

export default config;
