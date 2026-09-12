# Email-first sign-in and sign-up (emailfirst lane, 2026-09-11)

Twilio is stuck in compliance review and cannot send texts for weeks, but
Jacob needs the site usable on UAT this weekend. His words: "Maybe we can find
a workaround for now, like only using email? Have phone number be coming
soon?" Email OTP already worked end to end (Resend live, the recording fake
without a key), so this wave makes email the primary channel and parks phone
as "coming soon" in the UI, while keeping the phone channel fully wired in the
API - fakes, tests and one e2e spec still exercise it.

## API (`api/src/domains/accounts/auth`)

- **`sign_up` no longer requires a phone.** `SignUpBody.phone_number` is now
  optional (`packages/contracts/src/computed/auth.ts`, same
  `.unwrap().optional()` idiom `SendCodeBody`/`VerifyCodeBody` already used).
  `service.signUp` picks the channel from what was given - phone if present
  (unchanged behaviour), email otherwise - and reserves the send, holds the
  pending signup and dispatches on whichever channel is real.
- **The temporary-email trick stays, untouched, for phone-first signups.**
  `rules.temporaryEmailFor` / `TEMP_EMAIL_DOMAIN` and the `phoneNumber`
  plugin's `signUpOnVerification.getTempEmail` are exactly as they were - a
  phone-first user still gets a placeholder email that `verifyCode` overwrites
  with the real one after the code lands. An email-first user never touches
  this path: there is no temp value to invent because email is the value
  already given at sign-up.
- **The mirror-image path for email:** `emailOTP`'s `disableSignUp` flips from
  `true` to `false` in `accounts/auth/client.ts`. Without it,
  `/sign-in/email-otp` refuses to create an account for an unknown address at
  all, which is exactly what blocked a phone-less sign-up. It is safe for the
  same reason the phone plugin's auto-create has always been safe: a real code
  is only ever dispatched through our own `signUp`/`sendCode` enumeration
  guard (`may && known` for sign-in, `may && !takenPhone && !takenEmail` for
  sign-up), so an unknown address reaching verification is, by construction, a
  legitimate new signup, never a probe. `tests/config-options.test.ts` now
  pins `disableSignUp === false` with that reasoning; it used to pin `true`.
- **`auth.pending_signups.phone_number` is nullable.** It was `NOT NULL
  UNIQUE`, adequate when every sign-up went through the phone. Migration
  **183** (`183_a_sign_up_may_start_from_email.sql`) drops the `NOT NULL` and
  adds a partial unique index, `pending_signups_one_email_no_phone` on
  `(email) WHERE phone_number IS NULL`, so a second email-only attempt at the
  same address still reuses the row instead of racing it - the same property
  the phone path already had via its own unique index. `auth.users
  .phone_number` needed no migration; it has been nullable since genesis.
  Applied to dev; contracts regenerated (`pending_signups.ts`, one line).
  177-182 are another lane's; nothing here touches them.
- **`db/auth/pending-signups`** grew the email-keyed twin of every phone
  verb: `byEmail`, `create`'s branch when `phone_number` is null (routes to
  `sql/create_by_email.sql`, the same upsert shape keyed on the new partial
  index), and `removeByEmail`. Repo tests cover all three.
- **Step-up now prefers email, not phone.** `rules.stepUpChannel` used to pick
  SMS whenever the phone was verified. During a Twilio outage that is a live
  bug - an existing user with both factors verified would be sent a step-up
  code down a channel that cannot be delivered, and locked out of a change
  they were entitled to make. It now reads `user.emailVerified ? 'email' :
  'sms'` - email whenever it is proved, phone only as the fallback. This is
  the second half of "email-first"; the first is what channel a NEW account
  starts from, the second is what channel an EXISTING one hears from by
  default.
- **`change_email` / `change_phone` are unchanged in shape.** Ruling 91's rule
  1 - a factor is verified through the OTHER one - is a security property tied
  to which factor is changing, not a preference, and stays symmetric either
  way. What was checked: a phone-less user is correctly refused a `change_
  email` request with "add and verify a phone number before changing the
  email address" (there is nothing to verify through), which is the existing
  `assertOtherFactorVerified` guard doing exactly what it already did - no
  code change, just confirmation it does not crash on a null phone.
- **`captchaRequired` was already channel-agnostic.** No change.
- The SMS provider, its fake, and every phone-only test stay. Nothing about
  phone sign-in, sign-up, or change was removed.

## Frontend (`frontend/app/auth/*`, `frontend/shared/hooks/auth`,
`frontend/shared/ui/auth/AuthForm.tsx`)

- **`/auth/sign-in` now asks for email first** (previously phone, with
  "Email me the code instead"). Its old phone-collecting content moved,
  unchanged, to a new route, **`/auth/sign-in/phone`** (`page.tsx`,
  `error.tsx`, `loading.tsx` - ruling 83's pair, copied verbatim from the
  sibling route). The phone screen still offers "Prefer email?" back to
  `/auth/sign-in`; the email screen offers no toggle to phone - it is not
  advertised as a live alternative, though it fully works if reached
  directly (bookmarked, typed, or from a test).
- **`/auth/sign-in/email` is deleted**, not neutered (ruling: delete, do not
  neuter) - it was made redundant the moment `/auth/sign-in` became the email
  screen. `frontend/shared/types/routes.ts`'s `signInEmail` entry became
  `signInPhone: '/auth/sign-in/phone'`.
- **`AuthForm`'s `codeFooter`** ("Wrong number?" / "Wrong email?") now points
  an SMS code's "Change it" at `/auth/sign-in/phone` and an email code's at
  `/auth/sign-in` - the code screen already carries `view.channel`, so which
  factor sent the code decides the copy and the link exactly as before; only
  the two destinations swapped.
- **Sign-up's phone field stays visible but disabled**, with the helper text
  "Text sign-in coming soon" (the existing `Input` component's own `disabled`
  state and `message` slot - no new component). Its `invalid`/`message`
  binding for a server-side error moved to the Email field, since a signup
  error (an email already on file, most likely) now has nowhere else to land
  once the phone field can no longer show one. `sign-up/page.tsx` only sends
  `phone_number` when it is non-empty, so a disabled field submits `undefined`
  and the sign-up completes over email alone - the same optional-phone path
  the API now accepts natively.
- **Verify-screen copy needed no change.** It already read `view.destination`
  and `view.channel` generically ("We sent a 6-digit code to `<destination>`")
  rather than hard-coding "phone" or "text"; once sign-up dispatches over
  email, the same line renders the masked email without edits.
- `?next=` and the landing rules (`returnTo.ts`) are untouched - channel and
  destination are orthogonal to where a signed-in caller lands.

### The switch back, when Twilio clears

**`frontend/shared/utils/authForm.ts`: flip `PHONE_SIGN_IN_LIVE` from `false`
to `true`.** That one line re-enables the sign-up phone field (drops
`disabled`, drops the "coming soon" helper) and is the flag Jacob asked for -
"flipping one default back." Two things it does **not** cover, because they
are file-based Next.js routes rather than a runtime setting: making
`/auth/sign-in` show phone again means swapping the contents of
`frontend/app/auth/sign-in/page.tsx` and `.../sign-in/phone/page.tsx` back (a
small, mechanical file swap - both already exist and both already work); and
`rules.stepUpChannel` in the API reverts to `user.phone_number &&
user.phone_number_verified ? 'sms' : 'email'` if step-up should prefer phone
again once delivery is reliable. Nothing about the sign-up API changes either
way - phone has been optional, not disabled, this whole time.

## Figma deviation

**The disabled phone field with "Text sign-in coming soon" is not drawn
anywhere in the Auth Form frame.** Ruling 96 asks that no frontend component
ship without a Figma design Jacob approved; this is not a new component (the
existing `Input`'s disabled state and message slot, both already in the
library), but the specific COMBINATION - a disabled field with that exact
copy on the sign-up screen - has no frame. It ships now because Jacob asked
for the phone-coming-soon behaviour by name this week and UAT is this
weekend; it should get a five-minute look in Figma when there is time, same
as the OTP caret and cell-shape fixes did in the prior lane.

## Seeds and e2e

- `api/scripts/seed-e2e-users.mjs` already seeded both a verified email and a
  verified phone number for both e2e accounts; nothing there needed to
  change. Its own phone sign-in smoke check at the end is untouched -
  intentionally, since it doubles as proof the phone channel still works
  after seeding.
- `frontend/shared/tests/auth.setup.ts` (the Playwright session bootstrap
  every other spec reuses) now goes through the API the way the frontend
  does - `POST /api/account/send_code` (channel `email`) ->
  `GET /api/account/last_code?email=` -> `POST /api/account/verify_code` -
  instead of calling better-auth's own `/api/auth/phone-number/send-otp`
  directly. It used to bypass our captcha/throttle rules entirely; now it
  exercises the real wrapper, same as a customer would.
- `frontend/app/auth/_src_/tests/sign-in-journey.e2e.ts`'s deep journey
  (captcha, caret, the redirect-fix regression, the code-screen checks) now
  runs over email at `/auth/sign-in`, matching the new default. A second,
  smaller test in the same file drives `/auth/sign-in/phone` directly through
  a full send/read/verify/session cycle, so the phone channel keeps real e2e
  coverage rather than just a config assertion.
- `auth-screens.e2e.ts`'s old "phone first, email as equal fallback" test is
  now "asks for email first, no phone toggle offered", plus a new test
  confirming `/auth/sign-in/phone` still renders and its own toggle still
  returns to `/auth/sign-in`; the sign-up test gained assertions that the
  phone field is present, disabled, and carries the coming-soon text.
- **E2e was not run.** It needs a live API and frontend dev server; this
  lane's verification is the API test suite, the frontend unit/component
  suite, and `pnpm check:fast`, all green. Running the Playwright suite
  (`pnpm --filter @dorado/frontend e2e`, skipping `@maps`) is the one
  remaining manual check before UAT.

## Tests added

- API: `db/auth/pending-signups/tests/repo.test.ts` - three new cases for the
  email-keyed create/byEmail/removeByEmail path (create, dedupe-by-email,
  delete). `domains/accounts/auth/tests/verify-code.test.ts` - a phone-less
  sign-up that creates an account with no phone number, and a taken-email
  sign-up that dispatches nothing (the enumeration guard, mirrored from the
  existing taken-phone case). `tests/change-flow.test.ts` - the step-up test
  is now two: email preferred when verified, phone when it is not.
  `tests/rules.test.ts` and `tests/config-options.test.ts` updated for the
  new `stepUpChannel` order and `disableSignUp: false`.
- Frontend: `shared/tests/auth/AuthForm.test.tsx` - the sign-in describes are
  now "by email (the default)" and "by phone (parked, still wired)"; a new
  case pins the disabled phone field and its helper text on sign-up; the
  `codeFooter` link tests point at the new destinations.
  `app/auth/_src_/tests/authRoutes.test.tsx` - `/auth/sign-in` exercises
  email, `/auth/sign-in/phone` (new import) exercises phone, and the sign-up
  case now expects `phone_number: undefined` since the field cannot be typed
  into.

## Verification

- `pnpm --filter @dorado/api typecheck` - clean.
- `pnpm --filter @dorado/api test` - **297 files, 1883 passed.**
- `pnpm --filter @dorado/frontend typecheck` - clean.
- `pnpm --filter @dorado/frontend test` - **12 files, 191 passed.**
- `pnpm check:fast` from the worktree root - **PASS, `CHECK_EXIT=0`**
  (contracts build + every `api-lint` member + `api-test` + `design`, ~63s).
- Migration 183 applied to dev; `verify:genesis`/`verify:backfill`/etc. were
  not run (they are `dev-db` gate members, outside `check:fast`, and per the
  prior auth wave's own note, dev already carries unrelated schema from other
  in-flight lanes at migration 176+ that makes those five noisy regardless of
  this change).
