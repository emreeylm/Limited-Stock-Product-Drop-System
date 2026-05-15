/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:     '#0A0A0A',
        surface: '#111111',
        line:    '#222222',
        muted:   '#555555',
        yellow:  { DEFAULT: '#E8FF00' },
        bad:     '#FF3B3B',
        good:    '#00FF88',
      },
      fontFamily: {
        head: ['"Bebas Neue"', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
        body: ['Geist', 'ui-sans-serif', 'sans-serif'],
      },
      letterSpacing: {
        wide2: '0.2em',
      },
    },
    borderRadius: {
      none: '0',
      DEFAULT: '0',
    },
  },
  plugins: [],
};
