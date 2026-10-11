/** @type {import('tailwindcss').Config} */

/*
 * Design tokens — "Polarlicht" scheme.
 *
 * `gray` is a navy-tinted neutral (replaces Tailwind's default so every `gray-*`
 * class follows it), `brand` is the cyan brand scale and `violet` the secondary
 * colour, used sparingly for the running timer and the logo gradient.
 * Scales are built in OKLCH with even lightness steps: text on 600 and 600 on
 * white meet WCAG AA; in dark mode use 400 (text) or 400 + gray-950 text (fills).
 */
const neutral = {
  50: '#f5f8fc',
  100: '#eff3f8',
  200: '#e0e6ed',
  300: '#cdd4de',
  400: '#9ba4b0',
  500: '#67717e',
  600: '#4c5764',
  700: '#364150',
  800: '#1f2b3b',
  900: '#0c1522',
  950: '#060d18',
};

const brand = {
  50: '#eef9fd',
  100: '#ddf3fb',
  200: '#bfe7f6',
  300: '#8bd5ef',
  400: '#38bae0',
  500: '#019bbf',
  600: '#007b98',
  700: '#03677f',
  800: '#005368',
  900: '#014252',
  950: '#002a36',
};

const violet = {
  50: '#f7f5ff',
  100: '#eeecff',
  200: '#e0daff',
  300: '#cabfff',
  400: '#ac96fe',
  500: '#9171f1',
  600: '#7a50de',
  700: '#6740c0',
  800: '#53339c',
  900: '#412a79',
  950: '#291950',
};

/*
 * Status colours come from CSS variables (index.css) so the colour-vision setting can
 * swap them: standard = Tailwind's emerald/amber/red, red-green = blue/yellow/orange
 * (and the info blues `blue`/`sky` move to the brand cyan so they stay apart from it).
 * The Tailwind names stay usable (`text-emerald-600`), opacity modifiers keep working.
 */
const channelScale = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      `rgb(var(--${name}-${step}) / <alpha-value>)`,
    ])
  );
const success = channelScale('success');
const warning = channelScale('warning');
const danger = channelScale('danger');
const blue = channelScale('blue');
const sky = channelScale('sky');

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
        brand,
        violet,
        success,
        warning,
        danger,
        emerald: success,
        green: success,
        amber: warning,
        yellow: warning,
        red: danger,
        blue,
        sky,
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
        glow: '0 0 0 1px rgb(1 155 191 / 0.25), 0 8px 24px -8px rgb(1 155 191 / 0.45)',
        // Dark mode: a faint cyan light edge along the top of a card
        edge: 'inset 0 1px 0 0 rgb(56 186 224 / 0.08)',
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
          '0%': { backgroundColor: 'rgb(1 155 191 / 0.14)' },
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
