import { test, expect } from '@playwright/test'

// The first end-to-end flow, and it is deliberately the whole stack rather than
// the widest one.
//
// /rates is public - roles: [] - so it needs no session, no fixture user and no
// seeded cart. What it does need is everything underneath: Next renders the
// page, React Query calls /api/rates/tiers, Express answers it from the
// database. Nothing else in this repo tests that chain. The API replay suite
// proves the endpoint answers; the vitest units prove the pure functions; only
// this proves a browser gets prices.
//
// WHAT MAKES THESE ASSERTIONS REAL RATHER THAN DECORATIVE. The page renders
// "Loading current rates…" whenever the rate list is empty, and the heading and
// prose render either way. So a test that only checked the <h1> would pass with
// the API switched off entirely. Every test below turns on data having arrived.
test.describe('the public rates page', () => {
  test('renders and shows the page itself', async ({ page }) => {
    await page.goto('/rates')
    await expect(page.getByRole('heading', { name: /Industry-Leading Rates/i })).toBeVisible()
  })

  // THE ASSERTION THIS FILE EXISTS FOR. A metal card only renders for a metal
  // the API returned, so its presence is evidence the request completed and the
  // database had rows. If the API is down this is what fails, which is the
  // behaviour wanted - a green E2E suite against a dead API is worse than none.
  test('shows rates that came from the API, not an empty shell', async ({ page }) => {
    await page.goto('/rates')

    // At least one of the four metals must have a card. Not all four: which
    // metals have rates is data, and asserting all of them would make this fail
    // for a legitimate business change rather than for a broken deployment.
    const metalHeadings = page.getByRole('heading', {
      name: /^(Gold|Silver|Platinum|Palladium)$/,
    })
    await expect(metalHeadings.first()).toBeVisible()

    // And the placeholder must be gone. This is the half that catches a fetch
    // which never resolved - the heading above can appear while the list is
    // still filling.
    await expect(page.getByText('Loading current rates…')).toHaveCount(0)
  })

  // A rate the customer cannot read is not a rate. The page formats percentages
  // through pctLabel, so this checks the numbers survived the round trip in a
  // form a person can act on rather than as "[object Object]" or "NaN%".
  test('the percentages render as readable numbers', async ({ page }) => {
    await page.goto('/rates')
    await expect(
      page.getByRole('heading', { name: /^(Gold|Silver|Platinum|Palladium)$/ }).first()
    ).toBeVisible()

    const body = await page.locator('main').innerText()
    expect(body).toMatch(/\d+(\.\d+)?\s*%/)
    expect(body).not.toMatch(/NaN/)
    expect(body).not.toMatch(/\[object Object\]/)
    expect(body).not.toMatch(/undefined/)
  })

  // Nothing on a public page should require a session, and nothing should have
  // failed quietly in the console while it rendered. A page can look correct
  // and be throwing on every render.
  test('renders with no console errors and no failed requests', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console: ${msg.text()}`)
    })
    page.on('requestfailed', (req) => {
      problems.push(`request failed: ${req.method()} ${req.url()}`)
    })
    page.on('response', (res) => {
      if (res.status() >= 500) problems.push(`${res.status()} from ${res.url()}`)
    })

    await page.goto('/rates')
    await expect(
      page.getByRole('heading', { name: /^(Gold|Silver|Platinum|Palladium)$/ }).first()
    ).toBeVisible()

    expect(problems, `the page rendered but reported problems:\n${problems.join('\n')}`).toEqual([])
  })
})
