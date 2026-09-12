import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function findChrome(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROME) return process.env.PLAYWRIGHT_CHROME

  const root = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome')
  if (!fs.existsSync(root)) return undefined

  const candidates = fs
    .readdirSync(root)
    .map((dir) => path.join(root, dir, 'chrome-linux64', 'chrome'))
    .filter((p) => fs.existsSync(p))
    .sort()
    .reverse()

  return candidates[0]
}

const chrome = findChrome()

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

if (/doradometals\.com/i.test(baseURL) && !process.env.I_MEANT_PRODUCTION) {
  throw new Error(
    `refusing to run end-to-end tests against ${baseURL}.\n` +
      'These drive real forms and submit them. Point BASE_URL at a local or ' +
      'staging frontend.'
  )
}

export default defineConfig({
  testDir: '.',
  testMatch: ['**/tests/*.e2e.ts', '**/tests/**/*.e2e.ts', '**/tests/auth.setup.ts'],
  testIgnore: ['**/node_modules/**', '**/.next/**'],
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(chrome ? { launchOptions: { executablePath: chrome } } : { channel: 'chromium' }),
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },

    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/\/authed\//, /auth\.setup\.ts$/, /app\/admin\//],
    },

    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /app\/admin\/.*\.e2e\.ts$/,
    },
  ],

  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
