import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Proto Training Guide brand colors
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
        },
        orange: {
          50: '#fff8f0',
          100: '#ffecd9',
          200: '#ffd9b3',
          300: '#ffc38d',
          400: '#ffab66',
          500: '#ff9240',
          600: '#e67a33',
          700: '#cc6326',
          800: '#b34c19',
          900: '#99350c',
        },
        cream: {
          50: '#fefdf9',
          100: '#fdfbf3',
          200: '#fcf9ed',
          300: '#faf7e7',
          400: '#f9f5e1',
          500: '#f8f3db',
        },
      },
    },
  },
  plugins: [],
}
export default config
