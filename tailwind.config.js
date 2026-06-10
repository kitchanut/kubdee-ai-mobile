/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Semantic tokens mirror KubdeeTheme in src/theme/tokens.ts.
      // Solid colors use `R G B` CSS vars so opacity modifiers work
      // (e.g. bg-kd-cyan/40 replaces alpha(theme.cyan, 0.4)).
      colors: {
        'kd-screen': 'rgb(var(--kd-screen) / <alpha-value>)',
        'kd-panel': 'rgb(var(--kd-panel) / <alpha-value>)',
        'kd-panel-muted': 'rgb(var(--kd-panel-muted) / <alpha-value>)',
        'kd-card': 'rgb(var(--kd-card) / <alpha-value>)',
        'kd-card-muted': 'rgb(var(--kd-card-muted) / <alpha-value>)',
        'kd-border': 'rgb(var(--kd-border) / <alpha-value>)',
        'kd-border-strong': 'rgb(var(--kd-border-strong) / <alpha-value>)',
        'kd-text': 'rgb(var(--kd-text) / <alpha-value>)',
        'kd-text-muted': 'rgb(var(--kd-text-muted) / <alpha-value>)',
        'kd-text-subtle': 'rgb(var(--kd-text-subtle) / <alpha-value>)',
        'kd-input': 'rgb(var(--kd-input) / <alpha-value>)',
        'kd-tab-bar': 'rgb(var(--kd-tab-bar) / <alpha-value>)',
        'kd-active': 'rgb(var(--kd-active) / <alpha-value>)',
        'kd-shadow': 'rgb(var(--kd-shadow) / <alpha-value>)',
        'kd-blue': 'rgb(var(--kd-blue) / <alpha-value>)',
        'kd-orange': 'rgb(var(--kd-orange) / <alpha-value>)',
        'kd-emerald': 'rgb(var(--kd-emerald) / <alpha-value>)',
        'kd-cyan': 'rgb(var(--kd-cyan) / <alpha-value>)',
        'kd-amber': 'rgb(var(--kd-amber) / <alpha-value>)',
        'kd-red': 'rgb(var(--kd-red) / <alpha-value>)',
        // Soft tones are full color values (light theme uses solid
        // pastels, dark theme uses rgba washes) — no alpha modifier.
        'kd-orange-soft': 'var(--kd-orange-soft)',
        'kd-emerald-soft': 'var(--kd-emerald-soft)',
        'kd-cyan-soft': 'var(--kd-cyan-soft)',
        'kd-amber-soft': 'var(--kd-amber-soft)',
        'kd-red-soft': 'var(--kd-red-soft)',
      },
      // Mirrors radii in src/theme/tokens.ts
      borderRadius: {
        'kd-sm': '4px',
        'kd-md': '6px',
        'kd-lg': '8px',
        'kd-xl': '10px',
      },
      // Mirrors typography in src/theme/tokens.ts
      fontSize: {
        'kd-tiny': '9px',
        'kd-micro': '10px',
        'kd-caption': '11px',
        'kd-body': '12px',
        'kd-label': '14px',
        'kd-title': '18px',
      },
    },
  },
  plugins: [],
};
