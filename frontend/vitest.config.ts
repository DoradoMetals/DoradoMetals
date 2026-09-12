import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['node_modules/**', '.next/**', '**/*.e2e.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude: ['node_modules/**', '.next/**', '**/*.e2e.ts'],
        },
      },
    ],
    coverage: {
      exclude: [
        'node_modules/**',
        '.next/**',
        'scripts/**',
        '**/*.e2e.ts',
        '**/tests/**',
        '*.config.*',
        'vitest.setup.ts',
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
})
