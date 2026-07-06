/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Vercel / Linear inspired sleek dark theme
        gray: {
          950: '#0a0a0a',
          900: '#111111',
          800: '#1a1a1a',
          700: '#2a2a2a',
          600: '#444444',
          500: '#666666',
          400: '#888888',
          300: '#a3a3a3',
          200: '#d4d4d4',
          100: '#f5f5f5',
        },
        accent: {
          500: '#3b82f6', // Professional blue
          600: '#2563eb',
        },
        obsidian: {
          950: '#0a0a0a',
          900: '#111111',
          850: '#151515',
          800: '#1a1a1a',
          700: '#2a2a2a',
        }
      },
      boxShadow: {
        'glow': '0 0 20px rgba(59, 130, 246, 0.1)',
        'input': '0 2px 10px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
