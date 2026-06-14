// Tailwind preset mapping the Lloyds design tokens (tokens.css CSS variables)
// into Tailwind theme tokens. Consumed by apps/console/tailwind.config.ts.
/** @type {import('tailwindcss').Config} */
const preset = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--lb-primary)",
          deep: "var(--lb-secondary)",
          everyday: "var(--lb-everyday-green)",
          vibrant: "var(--lb-vibrant-green)",
          calm: "var(--lb-calm-green)",
        },
        ink: {
          DEFAULT: "var(--fg-1)",
          2: "var(--fg-2)",
          3: "var(--fg-3)",
          inverse: "var(--fg-inverse)",
        },
        surface: {
          DEFAULT: "var(--bg-surface)",
          page: "var(--bg-page)",
          inverse: "var(--bg-inverse)",
        },
        line: {
          DEFAULT: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        danger: "var(--lb-error)",
        warning: "var(--lb-warning)",
        info: "var(--lb-info)",
        success: "var(--lb-success)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-text)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        "2xl": "var(--r-2xl)",
        pill: "var(--r-pill)",
        card: "var(--r-card)",
      },
      boxShadow: {
        1: "var(--sh-1)",
        2: "var(--sh-2)",
        3: "var(--sh-3)",
      },
    },
  },
};

export default preset;
