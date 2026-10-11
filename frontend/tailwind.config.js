/** @type {import('tailwindcss').Config} */

/*
 * Design tokens.
 *
 * `gray` is a slightly cool neutral (zinc-based) and `purple` is the violet brand
 * scale — both replace Tailwind's defaults so every existing `gray-*` / `purple-*`
 * class in the app picks up the refreshed palette without per-file edits.
 */
const neutral = {
  50: '#fafafb',
  100: '#f4f4f6',
  200: '#e7e7eb',
  300: '#d5d5dc',
  400: '#a1a1ac',
  500: '#71717c',
  600: '#52525c',
  700: '#3d3d46',
  800: '#26262d',
  900: '#17171c',
  950: '#0d0d11',
};

const brand = {
  50: '#f5f3ff',
  100: '#ede9fe',
  200: '#ddd6fe',
  300: '#c4b5fd',
  400: '#a78bfa',
  500: '#8b5cf6',
  600: '#7c3aed',
  700: '#6d28d9',
  800: '#5b21b6',
  900: '#4c1d95',
  950: '#2e1065',
};

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: neutral,
        purple: brand,
        primary: brand,
        purpleAccent: {
          500: brand[500],
          600: brand[600],
        },
        pinkAccent: {
          500: '#ec4899',
          600: '#db2777',
        },
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(15 15 20 / 0.04), 0 1px 3px 0 rgb(15 15 20 / 0.06)',
        lifted: '0 4px 12px -2px rgb(15 15 20 / 0.08), 0 2px 4px -2px rgb(15 15 20 / 0.06)',
        overlay: '0 24px 48px -12px rgb(15 15 20 / 0.25), 0 0 0 1px rgb(15 15 20 / 0.04)',
        glow: '0 0 0 1px rgb(124 58 237 / 0.25), 0 8px 24px -8px rgb(124 58 237 / 0.45)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'scale-out': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { opacity: '1', transform: 'translateX(0)' },
          to: { opacity: '0', transform: 'translateX(16px)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-left': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%) scaleX(0.4)' },
          '50%': { transform: 'translateX(30%) scaleX(0.6)' },
          '100%': { transform: 'translateX(100%) scaleX(0.4)' },
        },
        'soft-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        highlight: {
          '0%': { backgroundColor: 'rgb(124 58 237 / 0.14)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-out': 'fade-out 150ms ease-in both',
        'fade-up': 'fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-out': 'scale-out 140ms ease-in both',
        'pop-in': 'pop-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-out-right': 'slide-out-right 180ms ease-in both',
        'slide-in-left': 'slide-in-left 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-out-left': 'slide-out-left 200ms ease-in both',
        'page-in': 'fade-up 320ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'progress-indeterminate': 'progress-indeterminate 1.1s ease-in-out infinite',
        'soft-pulse': 'soft-pulse 2s ease-in-out infinite',
        highlight: 'highlight 1.2s ease-out both',
      },
    },
  },
  plugins: [],
}
