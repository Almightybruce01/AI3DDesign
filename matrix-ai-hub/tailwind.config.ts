import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        gold: { DEFAULT: '#9a7a1e', dim: '#7a6320' },
        surface: { 0: '#0a0c10', 1: '#12151c', 2: '#1a1f28' },
      },
    },
  },
  plugins: [],
};

export default config;
