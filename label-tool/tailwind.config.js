/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        panel: '#141414',
        border: '#2a2a2a',
        accent: '#5eead4',
      },
    },
  },
  plugins: [],
};
