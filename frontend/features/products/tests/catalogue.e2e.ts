import { test, expect } from "@playwright/test";

// The product catalogue, over a real browser.
//
// /buy is public (roles: []) and exercises the two features with the most
// migration surface left: products and spots. A card's price comes from the
// catalog quote, so this is the only test in the repo where a wrong shape shows
// up as a wrong PRICE rather than as a failed assertion about a field name.
//
// It is also what says the server-side grouping arrived: the page renders one
// card per FAMILY (GET /products answers groups), and a grouping that stopped
// resolving would render an empty grid perfectly happily.
//
// Like rates.spec.ts, every assertion turns on data having arrived: the page
// renders an empty grid perfectly happily, so counting cards is the only honest
// check. Verified by stopping the API - see e2e/README.md.
test.describe("the public product catalogue", () => {
  test("shows products that came from the API", async ({ page }) => {
    await page.goto("/buy");

    // The grid renders empty without complaint, so the card count is the
    // assertion. An <img> per product is the most stable handle - the card's
    // internals are styling and will move.
    const cards = page.locator("img[alt]");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
  });

  // A price of $0.00 is what a missing or renamed spot field looks like: the
  // page still renders, the card still appears, and the number is wrong. That
  // is exactly the failure a wire flip could introduce, and it is invisible to
  // a test that only counts cards.
  //
  // READING A PRICE IS NOT OBVIOUS, and the reason is worth recording so the
  // next person does not repeat the hour. Prices render through
  // @number-flow/react, a custom element that animates a spinning digit reel
  // inside a shadow root. Consequently:
  //
  //   innerText on <body>        -> no prices at all, they are in shadow DOM
  //   textContent on the element -> "" , the light DOM is empty
  //   shadowRoot .number text    -> "0123456789,0123456789..." - the WHOLE reel
  //                                 is in the DOM and CSS positions the digit
  //   element.value              -> undefined, the prop is not reflected
  //
  // The accessibility tree is the one place the rendered value appears, as
  // "$ 4 , 6 5 2 . 8 5" - character-separated but correct. So that is what this
  // reads. It also means a screen reader announces prices digit by digit, which
  // is poor but not broken, and is noted in FOLLOWUPS rather than fixed here.
  test("prices are real money, not zero or NaN", async ({ page }) => {
    await page.goto("/buy");
    await expect(page.locator("img[alt]").first()).toBeVisible();

    // Let the reel settle. Mid-animation the tree can show an in-between value,
    // which is a real source of flake rather than a hypothetical one.
    await page.waitForTimeout(2000);

    const snapshot = await page.locator("body").ariaSnapshot();
    const flattened = snapshot.replace(/(?<=[\d$.,])\s+(?=[\d.,])/g, "");

    const prices = [...flattened.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) =>
      Number(m[1].replace(/,/g, ""))
    );

    // TIED TO THE CARD COUNT, and that is the whole assertion.
    //
    // The first version checked only that no price was $0.00, and ITS CONTROL
    // FAILED. Renaming ask_spot to ask - exactly what a SPOTS_WIRE flip does -
    // does not zero the prices, it makes them VANISH: cards render with no
    // price, a handful of unrelated prices survive elsewhere on the page, and
    // "none of them are zero" stayed true. The test passed against the broken
    // state, which is worse than not having it.
    //
    // Measured, so the threshold is not a guess:
    //
    //   healthy            64 card images, 58 prices
    //   ask_spot renamed   64 card images,  4 prices
    //
    // Card images are roughly two per product (front and back thumbnails), so
    // the ratio is not 1:1 and asserting equality would be brittle. A quarter of
    // the image count sits far below healthy and far above broken.
    const cardImages = await page.locator("img[alt]").count();
    const floor = Math.max(10, Math.floor(cardImages / 4));

    expect(
      prices.length,
      `${cardImages} card images but only ${prices.length} prices reachable ` +
        `(expected at least ${floor}) - cards are rendering without a price, ` +
        `which is what a spot field rename does`
    ).toBeGreaterThanOrEqual(floor);

    const zeroed = prices.filter((p) => p === 0);
    expect(zeroed.length, `${zeroed.length} of ${prices.length} prices are $0.00`).toBe(0);

    expect(snapshot).not.toMatch(/NaN/);
    expect(snapshot).not.toMatch(/\$\s*undefined/);
  });

  test("renders with no console errors and no failed requests", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
    });
    page.on("requestfailed", (req) => problems.push(`request failed: ${req.url()}`));
    page.on("response", (res) => {
      if (res.status() >= 500) problems.push(`${res.status()} from ${res.url()}`);
    });

    await page.goto("/buy");
    await expect(page.locator("img[alt]").first()).toBeVisible();

    expect(problems, `the catalogue rendered but reported problems:\n${problems.join("\n")}`)
      .toEqual([]);
  });
});
