import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "brand-navy": "#1F3354",
        "brand-orange": {
          DEFAULT: "#F58657",
          hover: "#e07548",
          light: "#ff9a70",
        },
        "brand-cream": {
          dark: "#F5EBDB",
          DEFAULT: "#F9F2E8",
          light: "#FFFBF5",
        },
      },
      fontFamily: {
        marfa: ["Marfa Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
