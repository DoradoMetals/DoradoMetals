# End-to-end tests

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

## Writing one

The trap is a test that passes against a dead API. `/rates` renders its heading
and its prose from static JSX and only the cards from data, so asserting the
`<h1>` proves nothing. Every assertion in `rates.spec.ts` turns on data having
arrived, and that was verified the only way it can be — by stopping the API,
leaving the frontend up, and confirming all four fail.

That control also turned up something worth knowing: with the API unreachable
the page renders **nothing at all**, not even its own heading, despite the code
having a "Loading current rates…" state for exactly that case. The page is
client-rendered — the server HTML never carries the heading either way — so
something client-side stops the tree rendering rather than degrading. Not
chased down yet; recorded here because it is a real behaviour a customer would
see during an outage.
