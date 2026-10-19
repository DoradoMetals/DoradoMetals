import { defineConfig } from 'vitest/config'

// Every test in this package is a component test: it renders into jsdom and
// asserts behaviour, aria, and axe-core cleanliness. Pure-function lanes live
// in the apps; this package IS components, so there is no node lane.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/index.ts'],
      reporter: [['text', { skipFull: false }]],
      thresholds: { statements: 98, branches: 96, functions: 99, lines: 99 },
    },
  },
})
