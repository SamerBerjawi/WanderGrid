import colors from 'tailwindcss/colors.js';

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
  // DashboardWidgets builds accent classes at runtime (`bg-${color}-500/10`); the removed Play CDN used to
  // generate them on the fly, so the accents it can receive are safelisted here.
  safelist: [
    { pattern: /^(bg|text|border)-(blue|amber|indigo|rose|emerald|purple|sky|cyan|violet|teal|orange)-(400|500|600)(\/(5|10|15|20|25|30))?$/, variants: ['dark', 'group-hover'] },
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"SF Pro"', 'sans-serif'],
        // New pages (UI_UX_DESIGN_REFERENCE.md §1.2)
        rp: ['"Outfit Variable"', 'Outfit', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        // Smallest size in the system: 11px, for pills and counters only (UI-002, decision C-2).
        // Informational text uses text-xs (12px) or larger. text-3xs was retired.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      zIndex: {
        // Local layering inside a component (content above its own decoration).
        'raised': '10',
        'float': '20',
        'dropdown': '30',
        'sticky': '40',
        'modal-backdrop': '50',
        'modal': '60',
        'popover': '70',
        'toast': '80',
        'tooltip': '90',
      },
      colors: {
        // `gray` renders as Tailwind's neutral scale (previously remapped by the removed Play CDN config,
        // which is what users saw) — now decided in the one compiled config (UI-008, C-13).
        gray: colors.neutral,
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
        },
        // Departure Board (flag UI_DEPARTURE_BOARD): fixed palette, same in light and dark
        board: {
          bg: '#14161A',
          ink: '#14161A',
          paper: '#F4F1EA',
          amber: '#F5C518',
          muted: '#8B8F98',
          line: '#2A2D34',
          ok: '#4ADE80',
        },
        // New pages (UI_UX_DESIGN_REFERENCE.md §1.4): variables defined in components/new/new.css, scoped to .rp-root
        rp: {
          canvas: 'rgb(var(--rp-canvas) / <alpha-value>)',
          glow: 'rgb(var(--rp-glow) / <alpha-value>)',
          surface: 'rgb(var(--rp-surface) / <alpha-value>)',
          inset: 'rgb(var(--rp-inset) / <alpha-value>)',
          line: 'rgb(var(--rp-line) / <alpha-value>)',
          ink: 'rgb(var(--rp-ink) / <alpha-value>)',
          'on-ink': 'rgb(var(--rp-on-ink) / <alpha-value>)',
          paper: 'rgb(var(--rp-paper) / <alpha-value>)',
          muted: 'rgb(var(--rp-muted) / <alpha-value>)',
          green: 'rgb(var(--rp-green) / <alpha-value>)',
          rust: 'rgb(var(--rp-rust) / <alpha-value>)',
          mustard: 'rgb(var(--rp-mustard) / <alpha-value>)',
          'on-mustard': 'rgb(var(--rp-on-mustard) / <alpha-value>)',
          ochre: 'rgb(var(--rp-ochre) / <alpha-value>)',
          sea: 'rgb(var(--rp-sea) / <alpha-value>)',
          navy: 'rgb(var(--rp-navy) / <alpha-value>)',
          plum: 'rgb(var(--rp-plum) / <alpha-value>)',
        },
        // Golden Hour theme (flag UI_GOLDEN_HOUR)
        sunset: {
          coral: 'rgb(var(--sunset-coral) / <alpha-value>)',
          orange: 'rgb(var(--sunset-orange) / <alpha-value>)',
          sun: 'rgb(var(--sunset-sun) / <alpha-value>)',
          teal: 'rgb(var(--sunset-teal) / <alpha-value>)',
          lilac: 'rgb(var(--sunset-lilac) / <alpha-value>)',
          ink: 'rgb(var(--sunset-ink) / <alpha-value>)',
          cream: 'rgb(var(--sunset-cream) / <alpha-value>)',
          sand: 'rgb(var(--sunset-sand) / <alpha-value>)',
          plum: 'rgb(var(--sunset-plum) / <alpha-value>)',
          night: 'rgb(var(--sunset-night) / <alpha-value>)',
          dusk: 'rgb(var(--sunset-dusk) / <alpha-value>)',
        },
        // Blue shades used on Flights are variable-driven so Golden Hour can remap them to the primary palette
        blue: {
          50: 'rgb(var(--blue-50) / <alpha-value>)',
          100: 'rgb(var(--blue-100) / <alpha-value>)',
          400: 'rgb(var(--blue-400) / <alpha-value>)',
          500: 'rgb(var(--blue-500) / <alpha-value>)',
          600: 'rgb(var(--blue-600) / <alpha-value>)',
          700: 'rgb(var(--blue-700) / <alpha-value>)',
          950: 'rgb(var(--blue-950) / <alpha-value>)',
        },
        'light-bg': 'rgb(var(--light-bg) / <alpha-value>)',
        'light-card': 'rgba(255, 255, 255, 0.75)',
        'light-text': '#0F172A',
        'light-text-secondary': '#334155',
        'light-separator': 'rgba(0, 0, 0, 0.08)',
        'light-fill': '#F8FAFC',

        'dark-bg': 'rgb(var(--dark-bg) / <alpha-value>)',
        'dark-card': 'rgba(23, 23, 23, 0.75)',
        'dark-text': '#FFFFFF',
        'dark-text-secondary': '#E2E8F0',
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
        // New pages: page cards, deal/trip cards and modals, inset panels
        'rp-card': '28px',
        'rp-tile': '22px',
        'rp-inset': '16px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      backgroundSize: {
        '200%': '200% 100%',
      },
      transitionTimingFunction: {
        'glass': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '180': '180ms',
      },
      spacing: {
        '4.5': '1.125rem',
      },
      animation: {
        celebrate: 'celebrate 1s ease-in-out',
        'fade-in-up': 'fadeInUp 0.2s ease-out',
        'bg-pan': 'bg-pan 3s linear infinite',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
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
