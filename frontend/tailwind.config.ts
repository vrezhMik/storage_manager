import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './ui/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        accent: '#22d3ee'
      },
      backgroundImage: {
        'gradient-glow': 'radial-gradient(circle at 20% 20%, rgba(37,99,235,0.25), transparent 35%), radial-gradient(circle at 80% 30%, rgba(34,211,238,0.25), transparent 30%)'
      }
    }
  },
  plugins: []
};

export default config;
