# The sign-in code screen (otp lane, 2026-09-11)

Jacob, testing the new auth screens in a browser, reported four things in one
sitting:

- *"cloudflare seems to be popping up every page"* - sometimes as a "Verify you
  are human" checkbox.
- *"not seeing cursor blinking on the input fields"*.
- *"OTP looks too much like a rectangle. Lets fix in figma and then the code.
  Needs to be slightly more tall than wide"*.
- *"otp redirected me back to sign in"* - the six digits accepted, and the app
  back on the sign-in screen.

Two more came in while the lane ran: *"sign in should redirect to previous page
after success"*, and the seeded admin's phone number becoming configurable so he
can sign in on his own handset without a real number landing in the repository.

Worktree `otp-lane`. `packages/components`, `packages/theme`, `frontend`,
`api/src/domains/accounts/auth`, `packages/contracts` (one field),
`api/scripts/seed-e2e-users.mjs`, the root `package.json`, and the Figma library
file "Themes and Components" (`8A73quhBLBqotJlX95jN9j`, page `96:2`).

## 1. Figma first (ruling 96)

The cell was ALREADY drawn taller than wide and the code had quietly left the
drawing behind. The `OTP Cell` master (`96:18`) has been 48 x 56 in all five
states since it was made; the `OTP Input` symbol (`96:32`) carried six instances
RESIZED to 44 x 56, the row's gap is `spacing/sm` (12), and the component's
description said *"Cells fill the row evenly, so it adapts to the container"*.
The code took that last sentence literally - `flex-1` with `gap-[13px]` - so in
the 520px auth panel each cell measured about 60 x 56 and read as a rectangle.
That is the whole of Jacob's (c).

Two writes through `use_figma`, both verified by their own read-back dump:

| node | before | after |
|---|---|---|
| `179:21` Cells, six `OTP Cell` instances | 44 x 56 each, row 324 wide | **48 x 56 each**, row 348, component hugs to 380 |
| `96:11` `State=Focus` | a Digit, 1.5px `border/strong` | a **Caret** - 2 x 28 RECTANGLE, fill bound to `text/default`, no radius - and the Digit hidden |

Nothing else moved: the radius stays `radius/base`, the stroke weights stay
`stroke/hairline` / `stroke/emphasis`, the digit stays Heading/H3 semibold, the
gap stays `spacing/sm`. Both component descriptions carry a dated revision note
in the file's own convention, and the OTP Input's now says the cells are a fixed
48 x 56 that may SHRINK on a narrow container but never grow past 48 wide - so
taller than wide at every width, which is the rule the code implements.

**No variable changed**, so `capture.js` PART_1 was not re-run. PART_2 (the
hygiene sweep) was: `scanned` 3520 -> 3521 for the one new rectangle and every
category identical - `color 0, spacing 24, radius 0, textStyle 93, iconFill 0,
iconWeight 8`. The caret adds no finding because its fill is bound and it has no
radius. `snapshot.json` carries the new count; `pnpm figma:check` is clean.

## 2. The caret, and the cursor that was never there

`OTPInput` renders one real input over six drawn cells, and that input is
`opacity-0` - which hides its caret along with itself. Nothing else drew one, so
the active cell was simply blank. Three changes, all following the drawing:

- The active cell renders the **drawn caret**: `h-7 w-[2px] bg-foreground`
  (28 x 2, `text/default`), with `--animate-caret-blink` added to
  `packages/theme/theme.css` beside the accordion and marquee keyframes. A
  cursor that does not blink does not read as a cursor.
- The caret appears only in the cell the NEXT digit goes in - focused, not
  disabled, no digit of its own - which is what the Focus variant now draws.
- **The field takes focus on mount** (`autoFocus`, default true, opt-out for
  tests), and takes it back when a wrong code re-enables the cells.
- The hidden input's selection is pinned to the end of the value on every
  `select` and `click`, so the browser's invisible cursor and the drawn one can
  never disagree - typing, pasting six digits at once and backspace all act on
  the end, and the caret follows.
- The cells are `h-14 max-w-[48px] flex-1` in a `gap-sm justify-center` row: the
  drawing's 48 x 56 and 12px, shrinking on a narrow screen and never widening.

Seven new component tests pin it (caret present in the active cell only, absent
before focus / when full / when disabled, focus on mount, the drawn geometry,
backspace, paste). `pnpm --filter @dorado/components test`: 406 passed.

## 3. The widget is off the code screen entirely - and the API is why it can be

Jacob's amendment: *"the widget must NOT appear on the code screen at all, not
even on Resend"*, done properly on the API side rather than by hiding it.

`POST /api/account/send_code` now asks for a captcha token **only when there is
no live pending send for that identity**. `rules.captchaRequired(row, now)` is
true when the throttle row has no `last_sent_at` or when the pending code has
expired (`OTP_EXPIRES_SECONDS`), so a FIRST send always needs a token, a resend
inside the window needs none, and a resend after expiry needs one again. The
cooldown, the three-per-number and ten-per-IP limits and the lockout are
untouched - the captcha is the only thing that moved.

**It reads the THROTTLE row, never `auth.verification`, and that is the
enumeration-safe half.** `reserveSend` stamps `last_sent_at` for a known and an
unknown identity alike, while a verification row is only ever minted for a known
one: keying the rule off the verification row would answer 403 for an unknown
number and 200 for a known one, which is exactly the leak rule 5 forbids. A test
asserts an unknown identity is gated identically on all three branches.

`SendCodeBody.captcha_token` is optional now. The frontend's code screen no
longer mounts `useCaptcha` at all and `AuthForm`'s code state has no captcha
slot, so no widget can render there even if a caller passes one. Sign-in,
sign-in-by-email, sign-up and the two factor-change screens keep theirs.

Measured in the browser with Cloudflare's always-passes test site key: sign-in
renders one widget host, `/auth/verify` renders **zero**, and the Resend posts
`{"channel":"sms","phone_number":"+1..."}` - no `captcha_token` - and is answered
200 with a fresh code.

## 4. The redirect: TWO causes, both client-side, captured in a real browser

Reproduced against a local API (port 5021, the per-branch local Postgres
`test_otp_lane`) and `next dev` (port 3021) from this worktree, driving Chrome
through the real screens and recording every request.

**The captured evidence, with the fix removed:**

```
NAV   /admin/orders/8d235227-…                  (signed out)
NAV   /auth/sign-in?next=%2Fadmin%2Forders%2F8d235227-…
POST  /api/account/send_code   200  {"status":"sent", …}
NAV   /auth/verify
POST  /api/account/verify_code 200  {"status":"verified", …}
GET   /api/auth/get-session    200  {"user":{"name":"E2E Admin", …}}
NAV   /auth/sign-in                              <- the bug
cookies: better-auth.session_token@localhost, better-auth.session_data@localhost
```

So the code was accepted, the session cookie WAS written and the session read
back as the admin. Nothing was refused, nothing expired, no cookie was lost
across ports and the widget had nothing to do with it. The bounce was the
browser's own.

**Cause 1 - the code screen bounced on the context it had just spent.**
`/auth/verify` holds two effects: one replaces to `/auth/sign-in` when there is
no verification in flight (a reload has to go somewhere), and one hands over on
`status: 'verified'` by calling `setVerification(null)` and then navigating.
Emptying the context re-runs the first effect, whose `replace('/auth/sign-in')`
is issued after the handover's own and therefore wins. A correct code landed on
the sign-in screen. The fix is a `leaving` ref: the handover sets it, and the
bounce does not fire while the screen is on its way out. `/auth/verify/step-up`
had the same shape and got the same guard.

**Cause 2 - the landing page's guard did not know a session existed.** With
cause 1 fixed the browser reached `/admin/orders/<id>` and immediately bounced
BACK to `/auth/sign-in?next=…`. `ProtectedPage` reads better-auth's reactive
session, and better-auth never saw a sign-in: `/api/account/verify_code` mints
the session server-side and returns cookies, so the client's session atom still
held the signed-out answer with `isPending` false, which every guard reads as
"not signed in". `useAdoptSession` now calls `auth.$store.notify('$sessionSignal')`
alongside `forgetSession()` and the cache clear - better-auth's own way to make
it ask again, and the pattern the impersonation hooks in the same file have
always used.

With both fixed, the same script lands on `/admin/orders/<id>` and the order
screen renders with the admin's avatar in the header.

## 5. Sign-in returns to where it started

`?next=` carries the path, `frontend/shared/utils/returnTo.ts` is the only place
that decides anything about it, and the rule is one function:

- `safeNext` honours a SAME-ORIGIN RELATIVE path only - one leading slash, no
  `//`, no backslash, no control characters, never `/auth/**` (it would loop) or
  `/api/**`. Anything else is dropped and the default landing is used. A `?next=`
  is attacker-supplied by construction: it is a query string anyone can put in a
  link and mail to a customer.
- `signInHref(pathname)` is what SENDS somebody to the screen: `ProtectedPage`'s
  bounce and the header's "Sign in" link and menu entry both use it.
- The sign-in, sign-in-by-email and sign-up pages read it with `useSearchParams`
  (inside a `Suspense` boundary, which is Next's rule for a client page) and put
  it in the verification in flight - the `next` field the context already had.
- `landingFor(role, next)` is applied once the code is accepted: what was asked
  for, else `/admin` for an admin and **`/` for a customer**. The role comes off
  `getSession()` - read before `adopt()` drops the caches - rather than being
  guessed.

**The two defaults are pages that exist, which took a correction.** They were
`/admin` and `/account` first; `/admin` is real (the navigation lane built it
after this branch was cut) but `/account` is not - the customer portal is a
later design - so a customer with no `?next=` would have landed on "Page not
found". Jacob's call, 2026-09-11: **a customer lands on the home page.** Both
constants live in `returnTo.ts` and change in one line when the portal is built.

`/auth/verify/step-up` still carries two `/account` literals of its own (the
"nothing to prove" bounce and its own success fallback). They are pre-existing,
they are only reachable from a signed-in settings flow that always sets its
`next`, and they were left alone rather than widened into this lane.

## 6. The seeded admin's number, and `pnpm seed`

`api/scripts/seed-e2e-users.mjs` reads `SEED_ADMIN_PHONE` (E.164, validated as a
US number, refusing loudly) and falls back to `+15555550100`. Jacob puts his real
number in his own `api/.env`, so no real number is written down here.
`frontend/shared/tests/roles.ts` reads the same variable, so the harness sends the
code to whatever was seeded rather than to the default.

The root `package.json` gained `"seed"`: `pnpm seed` runs `seed:e2e` then
`seed:e2e:order`, contracts building first through the existing pre-hooks. It
prints the disposable purchase order's id, which is what `E2E_ORDER_ID` wants.

**Not done here, deliberately: the one-line note in CLAUDE.md's Tests section.**
That file is Jacob's; an agent may not edit it on another agent's say-so. The
line to add is: *"`pnpm seed` from the repo root runs both e2e seeds in order
(users, then a disposable order) and prints the order id."*

## 7. The e2e spec that would have caught all of this

`frontend/app/auth/_src_/tests/sign-in-journey.e2e.ts` signs in **through the
screens**, which nothing did before: `shared/tests/auth.setup.ts` mints its
session through the API, so neither of the two causes above was visible to it.

The journey: a protected page while signed out -> the bounce carrying `?next=` ->
the phone form -> `/auth/verify` (no captcha host, the field focused, one caret,
a cell taller than wide) -> the code read back from
`GET /api/account/last_code` -> Verify -> the SAME page, with a session cookie and
no "Sign in" link in the header.

It starts on `/admin/orders/${E2E_ORDER_ID}` when that variable is set (the case
Jacob reported) and on `/settings/email` otherwise, because after the nuke there
is no admin index or order LIST to fall back to. The captcha assertions are
conditional on `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; the "no widget on the code
screen" assertion is not.

It lives under `app/auth/` so the `public` project takes it and it runs with NO
stored session - the `admin` project would have handed it one and defeated the
whole point.

## Verification

| gate | result |
|---|---|
| `pnpm --filter @dorado/components typecheck` / `test` | 0 errors / **406 passed** (7 new) |
| `pnpm figma:check` | clean, at budget (tokens, inventory, hygiene) |
| `pnpm --filter @dorado/frontend typecheck` / `test` / `build` | **0 errors** / **175 passed** (13 new) / compiled clean |
| `pnpm --filter @dorado/api typecheck` / `test` / `lint:db` | 0 / **1842 passed** (5 new) / clean |
| `pnpm --filter @dorado/api lint:client-boundary` | clean |
| `pnpm check:fast` from the worktree root | **PASS**, `CHECK_EXIT=0` (contracts build + every API lint + typecheck + the full API suite, 53.97s) |
| auth e2e, local API 5021 + `next dev` 3021 | **9 passed** - setup (2), auth-screens (6), the new journey |

The redirect fix is pinned twice: the browser journey above, and two unit tests
in `authRoutes.test.tsx` that fail on the old code - removing the `leaving` guard
turns both red with `replace('/auth/sign-in')`, which was confirmed by reverting
it on purpose before restoring.

**One unrelated test went red and it was right to.** Seeding a disposable order
into the LOCAL test database (`pnpm seed` with `USE_TEST_DB=1`, so the browser
repro had an order to land on) turned
`logistics/fulfillments/tests/service.test.ts`'s "a fulfillment with a real
shipment refuses to move off SHIPMENT" red. The test picked ANY fulfillment
joined to a `fulfillments.shipments` row, `LIMIT 1`, no ORDER BY - but the rule
it asserts, `categoriesFor`, locks the category on
`parcel.tracking_number != null`, a label that was actually BOUGHT. A shipment
row with no tracking number is movable by design, and `seed:e2e:order` mints
exactly that (it stubs `buyLabel`). So the test had been passing on an accident
of which row came first. Its query now asks for the tracking number the rule
reads, which is what it always meant. The service is unchanged; nothing about
this is a product defect. Its sibling in `schedule.test.ts` builds its own
fixture and was never at risk.

A note on the rate limit while testing: three sends per number per fifteen
minutes is real, and a repro loop hits it. The throttle rows for the two seeded
+1555555xxxx numbers were cleared between runs in the LOCAL `test_otp_lane`
database only (scratch data, seconds old, rebuilt by the suite's own preflight);
nothing in `exchange` or dev was touched, and no migration was run anywhere.
