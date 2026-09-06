# `shared/tests/`

The unit tests whose subject is shared by several routes (`*.test.ts[x]`, run by
`pnpm --filter @dorado/frontend test`), and the end-to-end harness. A test whose
subject belongs to one route lives in that route's `app/<route>/_src_/tests/`.

## What is left after the nuke (ruling 99)

Every customer and admin surface is deleted, and the specs that drove them went
with the surfaces. Three files remain here:

| file | what it covers |
|---|---|
| `auth/AuthForm.test.tsx` | the twelve states of the auth form, and that every number a customer reads comes off the API's view |
| `auth/authForm.test.ts` | `codeStateFor` and the countdowns |
| `auth.setup.ts` | the Playwright harness's sign-in, through the real OTP flow |

The one browser spec is `app/auth/_src_/tests/auth-screens.e2e.ts`. What used to
live here — the checkout journeys, the address drawer, the admin creates, the
public-pages sweep, the degradation suite, the price-reading helper — is in git
history, and each comes back with the screen it drives. Two lessons from those
specs are worth carrying forward and are recorded rather than reconstructed: a
spec must be checked against a BROKEN API (a rates spec that asserted only its
static heading passed against a dead one), and `@number-flow/react` renders
prices into a shadow root where only `ariaSnapshot()` can read them.

## End-to-end tests

`pnpm --filter @dorado/frontend e2e`

Playwright, deliberately **not** part of `pnpm check`. The vitest units run
there because they finish in seconds; these need a browser, a dev server and a
live API, and a check people skip is worse than a check that covers less.

Two projects: `setup` mints the seeded accounts' sessions through the real OTP
flow, and `public` runs the signed-out auth screens. The `customer` and `admin`
projects are gone with the `authed/` specs and come back with the first one.

## What they need running

The config boots `next dev` itself and reuses one if it is already listening.
It does **not** boot the API — start that separately, and seed the two accounts:

```
pnpm --filter @dorado/api seed:e2e
pnpm --filter @dorado/api start      # or dev
pnpm --filter @dorado/frontend e2e
```

`setup` reads the code back from the recording SMS fake through
`GET /api/account/last_code`, so `SMS_PROVIDER` must be unset (the fake is the
default) for it to pass.

The frontend talks to whatever API its own environment names, which is **dev**.
`BASE_URL` overrides the target, and the config refuses a `doradometals.com`
host outright: these tests fill in forms and submit them, and pointed at
production they would place real orders against real customers.

## Which browser

There is no `playwright install` step and no `~/.cache/ms-playwright`. The
config finds the Chrome that **puppeteer already downloaded for the PDF
renderer** and drives that — one browser for the repo, nothing new to fetch. It
resolves the newest version directory at config time rather than hardcoding one.
`PLAYWRIGHT_CHROME` overrides it; if no Chrome is found at all it falls back to
Playwright's own channel, so `npx playwright install` remains a way out.
