import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        inset: 'var(--bg-inset)',
        border: { subtle: 'var(--border-subtle)', strong: 'var(--border-strong)' },
        text: { primary: 'var(--text-primary)', secondary: 'var(--text-secondary)', tertiary: 'var(--text-tertiary)' },
        amber: { DEFAULT: 'var(--accent-amber)', dim: 'var(--accent-amber-dim)', bg: 'var(--accent-amber-bg)' },
        state: { success: 'var(--state-success)', error: 'var(--state-error)', warning: 'var(--state-warning)' }
      },
      fontFamily: {
        ui: 'var(--font-ui)',
        content: 'var(--font-content)',
        mono: 'var(--font-mono)'
      }
    }
  },
  plugins: []
} satisfies Config
