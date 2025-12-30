/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'app-bg': 'var(--app-bg)',
        'panel-bg': 'var(--panel-bg)',
        'accent': 'var(--accent-color)',
        'app-border': 'var(--border-color)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'success': 'var(--success)',
        'danger': 'var(--danger)',
      }
    },
  },
  plugins: [],
}