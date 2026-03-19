const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Satoshi", ...fontFamily.sans],
        nohemi: ["Nohemi", "Satoshi", ...fontFamily.sans],
      },
    },
  },
  plugins: [],
};