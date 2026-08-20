/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./constants.ts",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./views/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./types/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      colors: {
        primary: {
          50: '#fef8f0',
          100: '#fdeed9',
          200: '#fbddb1',
          300: '#faca89',
          400: '#fcb045',
          500: '#fa9a1d',
          600: '#e78310',
          700: '#c1670e',
          800: '#995111',
          900: '#7d4312',
        },
        'light-bg': '#FAFAFA',
        'light-card': 'rgba(255, 255, 255, 0.75)',
        'light-text': '#181D27',
        'light-text-secondary': '#414651',
        'light-separator': 'rgba(0, 0, 0, 0.08)',
        'light-fill': '#F8FAFC',

        'dark-bg': '#050505',
        'dark-card': 'rgba(23, 23, 23, 0.75)',
        'dark-text': '#FFFFFF',
        'dark-text-secondary': '#CECFD2',
        'dark-separator': 'rgba(255, 255, 255, 0.1)',
        'dark-fill': 'rgba(30, 34, 48, 0.5)',

        semantic: {
          red: '#FF3B30',
          green: '#34C759',
          yellow: '#FFCC00',
          blue: '#007AFF',
        },
        'semantic-red': '#FF3B30',
        'semantic-green': '#34C759',
        'semantic-yellow': '#FFCC00',
        'semantic-blue': '#007AFF',
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        'glass-card': '0 8px 30px -4px rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        'glass-modal': '0 20px 50px -10px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
        'glass-light-card': '0 8px 24px -4px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)',
        'neu-raised-light': '2px 2px 4px rgba(0,0,0,0.1), -2px -2px 4px rgba(255,255,255,0.8)',
        'neu-inset-light': 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -2px -2px 4px rgba(255,255,255,0.5)',
        'neu-raised-dark': '2px 2px 4px rgba(0,0,0,0.5), -2px -2px 4px rgba(255,255,255,0.05)',
        'neu-inset-dark': 'inset 2px 2px 4px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.05)',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      backgroundSize: {
        '200%': '200% 100%',
      },
      animation: {
        celebrate: 'celebrate 1s ease-in-out',
        'fade-in-up': 'fadeInUp 0.2s ease-out',
        'bg-pan': 'bg-pan 3s linear infinite',
      },
      keyframes: {
        celebrate: {
          '0%, 100%': { transform: 'scale(1)' },
          '25%': {
            transform: 'scale(1.03)',
            backgroundColor: 'rgba(52, 199, 89, 0.2)'
          },
        },
        fadeInUp: {
          'from': { opacity: 0, transform: 'translateY(10px)' },
          'to': { opacity: 1, transform: 'translateY(0)' },
        },
        'bg-pan': {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '0% center' },
        }
      }
    }
  },
  plugins: [],
}
