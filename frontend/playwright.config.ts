import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// End-to-end tests, deliberately separate from `pnpm test`.
//
// The unit tests are vitest and run in `pnpm check`. These do not: they need a
// browser, a built frontend and a live API, so a check that took two minutes
// would take ten and fail for reasons unrelated to the change being checked.
// Run them with `pnpm --filter @dorado/frontend e2e`.
//
// WHICH BROWSER, AND WHY NOT A DOWNLOADED ONE.
//
// `npx playwright install` fetches its own ~150MB Chromium. This machine
// already has Chrome on disk - puppeteer downloaded it for the PDF renderer -
// so these drive that instead. One browser for the whole repo, nothing new to
// fetch, and the PDFs a customer receives are rendered by the same engine the
// E2E tests drive.
//
// If PLAYWRIGHT_CHROME is set it wins, and if no Chrome is found at all the
// config falls back to Playwright's own channel so that `playwright install`
// remains a valid way out rather than this being a dead end.
function findChrome(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROME) return process.env.PLAYWRIGHT_CHROME

  const root = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome')
  if (!fs.existsSync(root)) return undefined

  // Newest first, resolved at config time. Hardcoding linux-148.0.7778.97
  // would break silently the next time puppeteer updates.
  const candidates = fs
    .readdirSync(root)
    .map((dir) => path.join(root, dir, 'chrome-linux64', 'chrome'))
    .filter((p) => fs.existsSync(p))
    .sort()
    .reverse()

  return candidates[0]
}

const chrome = findChrome()

// WHERE THESE RUN. Against whatever BASE_URL points at, defaulting to a local
// `next dev`. That frontend talks to the API named in its own environment,
// which is dev.
//
// THERE IS NO CONFIGURATION HERE THAT COULD POINT AT PRODUCTION, and that is
// deliberate rather than incidental: the guard below refuses a production-
// looking host outright. An E2E suite fills in forms and submits them; pointed
// at prod it would place real orders against real customers.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000'

if (/doradometals\.com/i.test(baseURL) && !process.env.I_MEANT_PRODUCTION) {
  throw new Error(
    `refusing to run end-to-end tests against ${baseURL}.\n` +
      'These drive real forms and submit them. Point BASE_URL at a local or ' +
      'staging frontend.'
  )
}

export default defineConfig({
  // TESTS LIVE WITH THE ROUTE THEY DRIVE, not in one central directory.
  //
  //   app/rates/_src_/tests/rates.e2e.ts
  //   app/buy/_src_/tests/catalogue.e2e.ts
  //   shared/tests/degradation.e2e.ts       <- genuinely cross-cutting
  //
  // That matches where the vitest unit tests already sit, so a route slice is
  // one directory rather than a folder here and a folder there. The `.e2e.ts`
  // suffix is what keeps the two runners apart: vitest takes `*.test.ts` and
  // explicitly excludes these, Playwright takes only these.
  //
  // Cross-route journeys - a checkout touches products, cart, addresses and
  // payments - belong in shared/tests rather than being filed under whichever
  // route they happen to start in.
  testDir: '.',
  testMatch: ['**/tests/*.e2e.ts', '**/tests/**/*.e2e.ts', '**/tests/auth.setup.ts'],
  testIgnore: ['**/node_modules/**', '**/.next/**'],
  // A failing E2E test is usually a real failure, but a flaky one wastes more
  // time than it saves. One retry locally, two in CI, and `retries` is the knob
  // to turn down if a test starts passing only on the retry - that is a bug in
  // the test, not a reason to raise it.
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
    // Runs first and once: signs the e2e accounts in and saves their sessions.
    { name: 'setup', testMatch: /auth\.setup\.ts$/ },

    // Public pages. No session, because most of the app must work without one -
    // and a suite that is signed in everywhere cannot notice when something
    // public quietly starts requiring auth.
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [/\/authed\//, /auth\.setup\.ts$/],
    },

    // Signed in, one project per role, reusing the saved state.
    {
      name: 'customer',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/customer.json' },
      dependencies: ['setup'],
      testMatch: /\/authed\/.*customer.*\.e2e\.ts$/,
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/admin.json' },
      dependencies: ['setup'],
      testMatch: /\/authed\/.*admin.*\.e2e\.ts$/,
    },
  ],

  // Boots `next dev` unless something is already listening. Not `next build &&
  // next start`: a build takes minutes and these tests are about behaviour
  // rather than production bundling.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
