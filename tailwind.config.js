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
        'sub-panel-bg': 'var(--sub-panel-bg)',
        'interactive-bg': 'var(--interactive-bg)',
        'interactive-hover-bg': 'var(--interactive-hover-bg)',
        'accent-bg': 'var(--accent-bg)',
        'accent-hover-bg': 'var(--accent-hover-bg)',
        'app-border': 'var(--border-color)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'success': 'var(--success)',
        'danger': 'var(--danger)',
      }
    },
  },
  plugins: [],
}
