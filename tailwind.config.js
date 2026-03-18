/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          sidebar: '#0d0d0d',
          header: '#1a1a1a',
          shell: '#111827',
        },
      },
    },
  },
  plugins: [],
}

