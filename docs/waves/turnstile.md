# Cloudflare Turnstile replaces reCAPTCHA (ruling 94, turnstile lane)

Jacob: *"Yeet all the captcha stuff"* — the Google stuff. The captcha stays; it
is Cloudflare's now, on the same provider interface ruling 94 asked for, and
no reCAPTCHA-named file, route, key, dependency or CSS rule survives anywhere.
`grep -ri recaptcha` over `api`, `frontend`, `packages` and `docs` returns
`docs/history`, **this file and its FOLLOWUPS entry** — the record of the
removal — and nothing else.

## What died

| gone | why |
|---|---|
| `api/src/providers/captcha/recaptcha.ts` | the Google adapter, its `siteverify` and its score reading |
| `scoreThreshold()` and `RECAPTCHA_THRESHOLD` | a v3 score has no counterpart in Turnstile: the answer is `success`, a boolean |
| `CAPTCHA_PROVIDER` | two adapters needed a switch; one adapter and a fake need a key |
| `api/src/domains/accounts/recaptcha/**` (controller, routes, `replay.test.ts`) | a route whose whole product was "verify this token and tell the browser" |
| `POST /api/recaptcha/verify-recaptcha` | the URL of that route |
| `useVerifyRecaptcha` (`packages/client`, and its frontend re-export) | its only caller was that route's shape |
| `frontend/shared/providers/GoogleRecaptchaProvider.tsx` | the v3 script provider in the root layout |
| `react-google-recaptcha-v3` | the dependency under it |
| `.grecaptcha-badge` in `packages/theme/base.css` | the rule that hid the floating badge |
| `providers/captcha/tests/threshold.test.ts` | the threshold it tested is gone |

**Ruling 13 does not protect the deleted route.** The URL and the file answer
different questions, but only while the product behind the URL still exists.
This one's product was a standalone verify, and a standalone verify is not a
thing any more: the token travels in the form body to `send_code` and
`sign_up`, and the server checks it there, where it can refuse the send. No
frontend surface called it — `frontend-routes.test.ts` proves that from the
other side, and it failed for one commit until `@dorado/client`'s hook went too.

## The provider

`api/src/providers/captcha/` is one interface (`types.ts`: `verify(token, ip)`)
and two adapters.

- `turnstile.ts` POSTs `secret` (`TURNSTILE_SECRET_KEY`), `response` (the
  token) and `remoteip` (the Cloudflare-aware `clientIp`, which reads
  `CF-Connecting-IP` only under `TRUST_CLOUDFLARE=1`) to
  `https://challenges.cloudflare.com/turnstile/v0/siteverify`, and reads
  `success` alone. **A missing token is refused without a siteverify call**: an
  unanswered widget and a forged one must read the same to the caller, and
  neither is worth a round trip.
- `fake.ts` records every check (`token`, `ip`, `passed`, `at`), accepts by
  default, and takes queued verdicts through `next(false)` so a test can refuse
  one send without mocking the network.
- `index.ts` selects: **a test run always takes the fake** (a real key in
  `api/.env` must never make the suite call Cloudflare), otherwise
  `TURNSTILE_SECRET_KEY` present takes Turnstile and absent takes the fake —
  and the fake **throws under `NODE_ENV=production`** rather than waving a bot
  through silently, the same shape as the SMS and email fakes.

`accounts/auth/rules.ts` is unchanged: `assertCaptcha(false)` is a `Forbidden`.
`service.ts` calls it at the top of `sendCode` and `signUp`, before anything is
minted, sent or written — so with the real adapter, a request carrying no token
is refused there and the provider is never dispatched to.

## Where the widget sits, and how the token flows

The Figma "Auth" file draws no captcha, and does not need to: the widget is a
third-party element, allowed exactly as the Google one was. It sits **inside
the form, immediately above the submit button** — `AuthForm` gained one
optional `captcha` slot, rendered on the identity screens (sign-in by phone,
sign-in by email, change email, change phone), on sign-up above "Create
account", and on the code screen above "Verify", which is where a **resend**
calls `send_code` again.

```
Turnstile (challenges.cloudflare.com/turnstile/v0/api.js?render=explicit)
  -> callback(token)  ->  useCaptcha()'s held token
  page submit         ->  await captcha.token()   (resolves at once once solved)
                      ->  sendCode / signUp  { ..., captcha_token }
                      ->  finally captcha.reset()  (new widget, no token twice)
  API  captcha.verify(token, clientIp(req))  ->  rules.assertCaptcha
```

- `frontend/shared/ui/auth/Turnstile.tsx` appends Cloudflare's script **once**
  (a module-level promise) and renders the widget explicitly. With no site key
  it renders nothing and loads no script at all.
- `frontend/shared/hooks/useCaptcha.tsx` holds the token, hands it to the
  submit, and re-keys the widget on `reset()` so a token is never used twice.
  An errored or expired widget settles as the empty token rather than leaving
  the form waiting, and a token that never arrives resolves empty after 30s:
  the server then refuses and the form says so, which is a message rather than
  a frozen button.
- **Local development needs no keys.** No site key means no widget and an empty
  token; no secret key means the API's recording fake, which accepts it. The
  e2e harness is untouched — `shared/tests/auth.setup.ts` mints its session
  through better-auth's own OTP endpoint and never reaches `send_code`.

## The two .env keys Jacob removes

Both real `.env` files are his; this lane edited neither.

| file | delete | keep / add |
|---|---|---|
| `api/.env` | `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_THRESHOLD` | `TURNSTILE_SECRET_KEY` (already set) |
| `frontend/.env` | `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (already set) |

`.env.example` and `api/.env.example` carry the new keys and describe the
no-key behaviour. `CAPTCHA_PROVIDER` was never in a real `.env` and is gone
from the docs.

## Verification

`pnpm check` green from the worktree root. Frontend typecheck 0, frontend tests
green including five new render tests for the widget (token present: the site
key reaches `render`, the callback's token reaches the submit, the widget is
re-rendered after a submit, an errored widget yields the empty token; token
absent: no widget, no script, empty token). API: the provider's own suite
covers both adapters, the fake's recording and queued verdicts, the
test-run/secret/production selection, and `send-code.test.ts` now proves the
token and the caller's IP reach the provider on every send and that a refusal
stops the send before the SMS.

The auth e2e specs (8, setup included — the one spec that signs in end to end
through OTP) ran green against a local API and `next dev` from this worktree on
ports 5007/3007. **And the real widget was driven in a real browser**: with
Cloudflare's always-passes test site key (`1x00000000000000000000AA`),
`/auth/sign-in` and `/auth/sign-up` each render one host element, load the
script exactly once, and carry a solved `cf-turnstile-response` token — the
widget sits between the Phone field and Continue, in the dark theme, which is
what the stub-based render tests cannot prove.
