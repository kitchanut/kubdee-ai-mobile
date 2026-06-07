/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        kubdee: {
          panel: '#1f2937',
          panelSoft: '#273244',
          line: '#374151',
          orange: '#f97316',
          emerald: '#10b981',
          cyan: '#06b6d4',
        },
      },
      borderRadius: {
        kubdee: '10px',
      },
    },
  },
  plugins: [],
};
