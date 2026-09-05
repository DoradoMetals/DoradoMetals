# `shared/tests/`

The unit tests whose subject is shared by several routes (`*.test.ts[x]`, run by
`pnpm --filter @dorado/frontend test`), and the cross-route end-to-end specs
below. A test whose subject belongs to one route lives in that route's
`app/<route>/_src_/tests/`.

## End-to-end tests

`pnpm --filter @dorado/frontend e2e`

Playwright, deliberately **not** part of `pnpm check`. The vitest units run
there because they finish in seconds; these need a browser, a dev server and a
live API, and a check people skip is worse than a check that covers less.

## What they need running

The config boots `next dev` itself and reuses one if it is already listening.
It does **not** boot the API — start that separately:

```
pnpm --filter @dorado/api start      # or dev
pnpm --filter @dorado/frontend e2e
```

The frontend talks to whatever API its own environment names, which is **dev**.
`BASE_URL` overrides the target, and the config refuses a `doradometals.com`
host outright: these tests fill in forms and submit them, and pointed at
production they would place real orders against real customers.

## Which browser

There is no `playwright install` step and no `~/.cache/ms-playwright`. The
config finds the Chrome that **puppeteer already downloaded for the PDF
renderer** and drives that — one browser for the repo, nothing new to fetch, and
the engine that renders a customer's packing list is the one the tests drive.
It resolves the newest version directory at config time rather than hardcoding
one. `PLAYWRIGHT_CHROME` overrides it; if no Chrome is found at all it falls
back to Playwright's own channel, so `npx playwright install` remains a way out.

## Reading a price

Prices render through `@number-flow/react`, a custom element that animates a
spinning digit reel inside a shadow root. It is not readable the obvious ways,
and this cost an hour:

| approach | result |
|---|---|
| `innerText` on `<body>` | no prices — they are in shadow DOM |
| `textContent` on the element | `""` — the light DOM is empty |
| shadow root `.number` text | `0123456789,0123456789…` — the whole reel |
| `element.value` | `undefined` — the prop is not reflected |

`ariaSnapshot()` is the one place the rendered value appears, character-separated
as `"$ 4 , 6 5 2 . 8 5"`. Flatten the spaces between digits and parse. Wait for
the reel to settle first — mid-animation the tree shows an in-between value,
which is a real source of flake.

## Writing one

The trap is a test that passes against a dead API. `/rates` renders its heading
and its prose from static JSX and only the cards from data, so asserting the
`<h1>` proves nothing. Every assertion in `rates.spec.ts` turns on data having
arrived, and that was verified the only way it can be — by stopping the API,
leaving the frontend up, and confirming all four fail.

A second control was written for the catalogue, and it FAILED — which is the
most useful thing that happened here. `buy.spec.ts` originally asserted that no
price was `$0.00`. Intercepting `/api/spots/spot_prices` and renaming `ask_spot`
to `ask` — exactly what a `SPOTS_WIRE` flip does — showed the prices do not go
to zero, they **vanish**: cards render with no price and a few unrelated prices
survive elsewhere, so "none are zero" stayed true and the test passed against
the broken state. A test that passes its own control is worse than no test.

The assertion is now tied to the card count, with the threshold taken from
measurement rather than guessed: healthy is 64 card images and 58 prices, the
renamed state is 64 and 4, and the floor is a quarter of the image count.

That first control also turned up a real bug, since traced: `LayoutProvider` returns
its loading skeleton **instead of `{children}`** whenever the session query is
pending, so every page in the app renders nothing until an auth round-trip
finishes — and nothing at all, indefinitely, if the API is unreachable. Measured
at 2s, 10s, 40s and 77s with the API stopped: empty body every time. Ten public
`seoIndex: true` routes are behind that gate. Written up in FOLLOWUPS.

It is worth noticing how it was found. Nothing in the API suites could have
caught it — the API was fine. It took a browser, and it took deliberately
breaking the thing the test depends on to see what the page does without it.
