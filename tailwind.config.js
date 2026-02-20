/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        surface: {
          deepest: "#1a1d21",
          deep: "#1e2126",
          base: "#222529",
          raised: "#2c2d31",
          hover: "#35373b",
          border: "#393b40",
        },
        accent: {
          400: "#6b9bff",
          500: "#4a7cf7",
          600: "#3b6be0",
          700: "#2d5acc",
        },
        text: {
          primary: "#e8e8ed",
          secondary: "#b5b5bd",
          muted: "#8b8b96",
          faint: "#636369",
        },
        badge: "#e01e5a",
      },
    },
  },
  plugins: [],
};
