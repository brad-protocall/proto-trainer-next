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
        "brand-orange": "#F58657",
        "brand-orange-hover": "#e07548",
        "brand-orange-light": "#ff9a70",
        "brand-cream": "#F9F2E8",
      },
      fontFamily: {
        marfa: ["Marfa Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
