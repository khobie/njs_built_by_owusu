import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  important: '.ea-portal-app',
  theme: {
    extend: {
      colors: {
        ea: {
          navy: '#0f172a',
          blue: '#1e40af',
          accent: '#3b82f6',
          gold: '#b45309',
        },
      },
    },
  },
  plugins: [],
};

export default config;
