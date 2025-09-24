/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#4f46e5" }, // indigo-600
      },
      borderRadius: { '2xl': '1rem' },
    },
  },
  plugins: [],
};
