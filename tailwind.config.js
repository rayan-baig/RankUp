/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Every colour below reads from a CSS variable that the active theme sets.
      // See src/styles/index.css and src/lib/applyTheme.js
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--ink-muted)',
        accent: 'var(--accent)',
        accent2: 'var(--accent-2)',
        good: 'var(--good)',
        warn: 'var(--warn)',
        bad: 'var(--bad)',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { theme: 'var(--radius)' },
      boxShadow: { theme: 'var(--shadow)' },
      maxWidth: { phone: '30rem' },
    },
  },
  plugins: [],
}
