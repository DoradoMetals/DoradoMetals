import { test, expect } from '@playwright/test'

// The site must render its own content even when the API does not answer.
//
// LayoutProvider used to return its loading skeleton INSTEAD OF {children}
// while the session query was pending, which gated every page in the app on an
// authentication round-trip. With the API unreachable it never resolved:
// /rates was measured empty at 2s, 10s, 40s and 77s. Ten routes declare
// seoIndex: true and every one is public, so during any API blip the marketing
// site was a blank page rather than a degraded one.
//
// The skeleton now stands in for the NAV, which is the thing that actually
// needs a session, and everything below it renders immediately.
//
// HOW THIS TEST WORKS WITHOUT STOPPING THE API. Killing the server would make
// this suite order-dependent and would break every other spec running beside
// it. Instead the browser is told to fail the API requests, which reproduces
// what the page sees - a request that never returns useful data - while leaving
// the real server alone.
test.describe('with the API unreachable', () => {
  test.beforeEach(async ({ page }) => {
    // ONLY THIS API. The first version of this used `**/api/**`, which is far
    // too broad - it also matched Google Maps' script URL and Sentry's ingest
    // endpoint, and blocking the Maps script takes GoogleMapsProvider down and
    // with it the whole React tree. Every test here failed, and the failure
    // looked exactly like the bug they were written to prove was fixed.
    //
    // Scoped to the API's own origin, taken from the same environment variable
    // the app uses, so this keeps working if the port moves.
    const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api')
    await page.route(`${api.origin}/**`, (route) => route.abort('failed'))
  })

  test('the public rates page still renders its own copy', async ({ page }) => {
    await page.goto('/rates')

    // The heading and prose are static JSX. They must not wait on a session.
    await expect(page.getByRole('heading', { name: /Industry-Leading Rates/i })).toBeVisible({
      timeout: 15_000,
    })

    const body = await page.locator('body').innerText()
    expect(body.length, 'the page rendered nothing at all').toBeGreaterThan(50)
  })

  // The counterpart, so the test above is about DEGRADING rather than about the
  // page having no data requirements. The rate cards come from the API and must
  // be absent - if they appeared, the route interception is not working and the
  // test above proves nothing.
  test('the data-driven part is absent rather than wrong', async ({ page }) => {
    await page.goto('/rates')
    await expect(page.getByRole('heading', { name: /Industry-Leading Rates/i })).toBeVisible({
      timeout: 15_000,
    })

    await expect(
      page.getByRole('heading', { name: /^(Gold|Silver|Platinum|Palladium)$/ })
    ).toHaveCount(0)
  })

  test('the catalogue also renders rather than hanging blank', async ({ page }) => {
    await page.goto('/buy')
    // /buy has no static heading of its own, so this is the weaker but still
    // meaningful assertion: the app shell renders instead of nothing.
    await expect(page.locator('footer, nav, header').first()).toBeVisible({ timeout: 15_000 })
  })
})
