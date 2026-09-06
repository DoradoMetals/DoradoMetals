import { test, expect } from '@playwright/test'

// Every public page, rendering without a session.
//
// Ten routes declare seoIndex: true and all are reachable by anyone. They are
// also the pages that were BLANK during an API blip until tonight, because
// LayoutProvider gated the whole document on an auth round-trip - so they are
// worth a permanent check that they render on their own terms.
//
// Runs in the `public` project, which has NO storageState. That is deliberate:
// a suite signed in everywhere cannot notice when something public quietly
// starts requiring a session.
const PAGES = [
  { path: '/', what: 'the home page' },
  { path: '/buy', what: 'the catalogue' },
  { path: '/sell', what: 'the sell page' },
  { path: '/rates', what: 'the rates page' },
  { path: '/payout-options', what: 'payout options' },
  { path: '/sales-tax', what: 'the sales tax page' },
  { path: '/privacy-policy', what: 'the privacy policy' },
  { path: '/terms-and-conditions', what: 'the terms' },
  { path: '/auth/sign-in', what: 'the sign-in page' },
] as const

for (const { path, what } of PAGES) {
  test(`${what} renders for a visitor with no account`, async ({ page }) => {
    const thrown: string[] = []
    page.on('pageerror', (e) => thrown.push(String(e.message).slice(0, 160)))

    const response = await page.goto(path)
    expect(response?.status(), `${path} did not return 200`).toBeLessThan(400)

    await page.waitForTimeout(2000)

    // An uncaught error during render is the failure that matters: the page may
    // still show something while a section of it is dead.
    expect(thrown, `${what} threw during render:\n${thrown.join('\n')}`).toEqual([])

    const body = await page.locator('body').innerText()
    expect(body.length, `${what} rendered an empty document`).toBeGreaterThan(80)

    // Nothing half-rendered. These are the strings that mean a value arrived
    // undefined and was interpolated anyway.
    expect(body, `${what} shows NaN`).not.toMatch(/NaN/)
    expect(body, `${what} shows undefined`).not.toMatch(/\bundefined\b/)
    expect(body, `${what} shows [object Object]`).not.toMatch(/\[object Object\]/)
  })
}

// A signed-out visitor must not reach an authed route. The redirect is the
// product's own guard - the API refuses regardless, but a page that renders
// admin furniture before bouncing has already shown too much.
for (const path of ['/admin', '/account']) {
  test(`${path} does not render for a visitor with no account`, async ({ page }) => {
    await page.goto(path)
    await page.waitForTimeout(3000)
    const body = await page.locator('body').innerText()

    // Either bounced elsewhere, or still on the path but showing nothing
    // privileged. Asserting the URL alone would miss a page that renders the
    // content and redirects a moment later.
    const stillThere = new RegExp(`${path}$`).test(new URL(page.url()).pathname)
    if (stillThere) {
      expect(body, `${path} rendered admin content to a signed-out visitor`).not.toMatch(
        /Purchase Orders|Sales Orders|Expenses|Profit and Loss/
      )
    }
  })
}
