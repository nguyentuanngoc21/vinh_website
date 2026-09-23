/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: { extend: { colors: {
    'brand-ink': '#143b4d', 'brand-gold': '#d9a441', stone: '#8a8178',
    cream: '#eceae7', 'cream-card': '#fbf7ec', 'cream-border': '#e2d9c8',
  } } },
  plugins: [],
};
