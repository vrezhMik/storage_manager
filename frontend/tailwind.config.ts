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
        primary: '#00613a',
        accent: '#def7ed'
      },
      backgroundImage: {
        'gradient-glow': 'radial-gradient(circle at 20% 20%, rgba(0,97,58,0.25), transparent 35%), radial-gradient(circle at 80% 30%, rgba(31,173,116,0.25), transparent 30%)'
      }
    }
  },
  plugins: []
};

export default config;
