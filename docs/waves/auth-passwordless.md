# Passwordless, phone-first auth (ruling 91)

Jacob, 2026-09-07: "We're getting rid of passwords." The design, including
its own rationale, is the Figma file "Auth" (hZ5Ajr9Hn1h2Q2XFRa1NYY, page
0:1; the frame "Auth — how this works", 41:1138, is the spec text; the
"Auth Form" frame 9:221 holds the twelve form states; each route has a
Desktop and Mobile frame). Every route ends in a code, so signing in and
recovering are the same act; there is no password and no reset flow.

## Routes (the frontend's; the API serves them)

| route | job |
|---|---|
| /auth/sign-in | phone first; "Email me the code instead" |
| /auth/sign-in/email | the same screen keyed to email |
| /auth/sign-up | name, email, phone, terms |
| /auth/verify | the code: one screen, three jobs (sign-in, sign-up, change) |
| /auth/verify?state=invalid | wrong code, attempts remaining |
| /auth/verify/step-up | proves it is still you before a change |
| /auth/locked | too many attempts, cooldown, support |
| /auth/session-expired | signed out for inactivity |
| /settings/email, /settings/phone | change a factor |
| /settings/email/confirmed | done; old address notified |

## The rules that carry the security (from the design, verbatim in spirit)

1. Changing a factor is verified through the OTHER one, and the customer
   does not choose: a phone change sends its code to the email, an email
   change to the phone.
2. Signing in is the exception: the customer may pick either channel.
3. Step-up is conditional: a session authenticated in the last few minutes
   goes straight to the change; a stale one gets /auth/verify/step-up.
4. After a change, notify the OLD value (that notice is the takeover alarm
   and carries the "wasn't you?" route). The confirmation screen is a plain
   success. Both factors never change in one session.
5. Copy: state a value only where the customer must act on it; mask it
   everywhere ((•••) •••-0134, j•••@doradometals.com) except the new value on
   the confirmed screen; say what to do, not how security works; never
   reveal whether an account exists (sign-in and sign-up fail identically
   for an unknown number).
6. Read-only values are disabled Inputs, never lookalike boxes.
7. Lockout: too many wrong codes locks the identity for a cooldown; the
   screen names support.
8. Not adopted: pausing payouts after a contact change. Open: passkeys;
   Apple and Facebook buttons (Google stays).

## API lane (first)

- better-auth 1.6.9 (pinned; do not bump): the `phoneNumber` plugin with
  OTP and the `emailOTP` plugin; the credential (password) provider is
  removed from the config; `set_password`, reset and change password routes
  and their tests die; Google stays. Password data in `auth.account` is not
  deleted (nothing in auth.* or exchange is destroyed), it simply stops
  being read.
- SMS is a provider (`providers/sms/`) behind one interface: `send(to,
  body)` plus inbound signature verification. Real adapter: Twilio
  Programmable Messaging from the business's own number (NOT Twilio Verify,
  Jacob's call: better-auth generates every code, phone and email alike,
  and Twilio only delivers; keys `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER` in .env, none present yet: the adapter refuses to
  start without them and the app still boots). A recording fake for
  dev/test stores the code where a test or the e2e harness can read it.
  Email codes go through the existing email provider and the media.emails
  trail. SMS-pumping defence is ours: US numbers only, per-number and
  per-IP send limits in rules, the captcha on the send, the lockout.
- Migration: `auth.users.phone_number` (unique where not null) and
  `phone_number_verified`, whatever the plugin needs on `auth.verification`,
  and a lockout fact (attempts and locked_until) on the identity being
  verified. Backfill: nothing (exchange holds no phones? check
  `exchange.users` for a phone column and carry it if it exists).
- Accounts domain (`accounts/auth`): the change-email and change-phone
  flows implementing rule 1 (server picks the channel), step-up freshness
  (better-auth's `freshAge`, set to the "last few minutes" the design
  names), the one-factor-per-session rule, the notify-old-value emails/SMS
  after commit, enumeration-safe responses (same shape and timing for known
  and unknown identities), lockout with cooldown, masked values in every
  response (the API never returns a full phone or email except the
  caller's own on the confirmed step).
- Contracts: bodies for sign-in (phone | email), sign-up, verify, change
  email, change phone; views for the verify state (destination masked,
  attempts remaining, locked_until).
- Every rule above is a test. e2e auth setup (`shared/tests/auth.setup.ts`)
  moves to OTP through the fake SMS provider.

## Frontend lane (second, after the API merges)

Build every frame from Figma with `get_design_context` per node, on
`@dorado/components` (the "Auth Form" component and its twelve states are
one component with variants), Desktop and Mobile; the Pitch panel; the
Back row; the masked values; disabled Inputs for read-only; `@dorado/client`
hooks only. Old routes (/authentication, /change-password,
/reset-password, /change-email, /verify-email, /verify-login) are deleted;
the new ones replace them (a redesign, not a factoring, so ruling 13 does
not hold them). e2e journeys rewritten to the OTP flow.

## Inbound SMS (ruling 92): "a webhook that can receive messages from the phone provider. Just a nice API for it."

One Twilio number for everything: OTP texts, two-way messaging and calls
(inbound works at once; outbound waits for the A2P 10DLC campaign, Jacob's
to register). The message log lives in `crm/sms`:

- `crm.sms_messages`: id, direction (inbound|outbound), provider, provider_sid
  (unique), from_number, to_number, body, media (jsonb, urls + content
  types), status (received|queued|sent|delivered|failed|undelivered),
  error_code, user_id (nullable, matched by verified phone at write time),
  received_at / sent_at, audit columns. One table, both directions, so a
  conversation is one query.
- `POST /api/sms/inbound`: Twilio's form-encoded webhook; the provider
  verifies the `X-Twilio-Signature` against the raw body and the public URL
  (a request that fails it is 403 and logged with no body); the row is
  written and committed; the reply is an empty TwiML `<Response/>`;
  idempotent on provider_sid (Twilio retries). STOP/START/HELP are Twilio's
  (Advanced Opt-Out); the row still lands so the log is complete.
- `POST /api/sms/status`: delivery status callbacks update the outbound
  row's status and error_code by provider_sid; idempotent, order-tolerant
  (a `delivered` after a `sent` wins, a `sent` after a `delivered` is
  ignored).
- Outbound: every send (OTP and conversational alike) writes its row before the provider call and updates it after,
  the same shape as the email trail.
- Reads: `GET /api/sms?user_id=&number=` (admin) returns the conversation as
  one SQL read (`SmsMessage` rows, newest last); `GET /api/sms/:id`.
- Contracts: `SmsMessage`, `SmsInbound` (the parsed Twilio body), `SmsStatus`.
  Tests: signature refused, idempotent replay, user matched by phone, status
  ordering, a recorded fixture of a real Twilio inbound payload shape.
- Both webhooks mount before the JSON body parser (they are form-encoded),
  the way the Stripe webhook mounts before it.

## Calls (ruling 93, amended): softphone from the start, no cell, no Google Voice

Twilio Voice, same account, the business number. `crm/calls`:

- `crm.calls`: id, provider_sid (unique), direction, from_number, to_number,
  user_id (nullable, matched by phone), employee_id (the admin on the call,
  nullable for unanswered inbound), status (queued|ringing|in-progress|
  completed|busy|no-answer|failed|canceled|voicemail), duration_seconds,
  recording_url, started_at, ended_at, audit columns.
- `POST /api/calls/token` (admin): a Voice SDK access token (identity = the
  employee id; short TTL); the TwiML app it needs is created on first run
  from the keys and its sid stored in `.env`-less config (a row in
  organizations or a documented one-time setup script; say which).
- `POST /api/calls/twiml`: Twilio's voice webhook, signature-verified.
  Outbound (the browser placed a leg to the app with `To=<user_id|number>`):
  writes the row, answers `<Dial callerId=business><Number>` the customer.
  Inbound (a customer called the business number): writes the row, answers
  `<Dial>` with one `<Client>` per admin currently registered with the SDK
  (presence tracked by the SDK's registration events through
  `POST /api/calls/presence`, or Twilio's client status; pick the simpler
  that is reliable and say why); no admin online or no answer within the
  ring timeout: `<Record>` voicemail with transcription, the recording url
  lands on the row, status `voicemail`, and the on-duty employee gets an
  email through the documents domain, after commit.
- `POST /api/calls/status`: status callbacks (signature-verified,
  idempotent, order-tolerant like the SMS status hook); recording callbacks
  update `recording_url`.
- Reads: `GET /api/calls/:id`; the customer timeline read (below) includes
  calls.
- Contracts: `Call`, `CallToken`, `CallStatus`, `CustomerTimeline`.
- Frontend: NONE in this lane (ruling 96: no component without a Figma
  design Jacob approved). The call panel is drafted in Figma first; the
  API is complete without it and testable with the Voice SDK from a test.
- Reads: one SQL read `GET /api/customers/:id/timeline` merging
  `crm.sms_messages`, `crm.calls` and the customer's `media.emails` rows
  into a `CustomerTimeline` view (kind, at, direction, summary, status,
  id): the feed the message component renders.

## Cloudflare (ruling 94)

Cloudflare will sit in front of the app for bot defence. In the API:
- the client IP used by rate limits and the lockout comes from
  `CF-Connecting-IP` only when `TRUST_CLOUDFLARE=1`; otherwise the socket
  address; never `X-Forwarded-For` blindly. One helper in shared, tested.
- the captcha check sits behind a provider interface (`providers/captcha`):
  Cloudflare Turnstile is the one adapter, a recording fake stands in when
  `TURNSTILE_SECRET_KEY` is absent, and the Google adapter is deleted
  (`docs/waves/turnstile.md`).
- the webhook routes (`/api/stripe`, `/api/sms/*`, `/api/calls/*`) are
  listed in the doc as paths Cloudflare's bot rules must allow; their own
  signature checks are the real guard.
- edge rate limits are a second layer; the API keeps its own OTP limits.

## Result (executed 2026-09-06 on `auth-lane`; nothing committed)

### Routes

Ours are under `/api/account` — better-auth still owns `/api/auth/*`, so the
plugin endpoints it mounts (`/sign-in/phone-number`, `/phone-number/send-otp`,
`/phone-number/verify`, `/sign-in/email-otp`, `/email-otp/*`) exist but are not
what the frontend calls. The eight the screens use:

| method | path | guard | body -> answer |
|---|---|---|---|
| POST | `/api/account/send_code` | — | `SendCodeBody` -> `VerificationView` |
| POST | `/api/account/verify_code` | — | `VerifyCodeBody` -> `VerificationView` + session |
| POST | `/api/account/sign_up` | — | `SignUpBody` -> `VerificationView` |
| POST | `/api/account/step_up` | user | `{}` -> `VerificationView` |
| POST | `/api/account/change_email` | user | `ChangeEmailBody` -> `VerificationView` |
| POST | `/api/account/change_phone` | user | `ChangePhoneBody` -> `VerificationView` |
| POST | `/api/account/confirm_change` | user | `ConfirmChangeBody` -> `ChangeConfirmedView` |
| GET | `/api/account/session` | user | -> `SessionView` |

`GET /api/account/last_code?number=` (SMS) or `?email=` (email) exists ONLY
when at least one of the recording fakes - SMS or email - is the selected
provider AND `NODE_ENV !== 'production'`. The decision is made once, at mount
time, so a real deployment has no route to reach rather than a guard that
could be got past. It is what the e2e harness will read.

### Local development

No keys are needed to sign in locally. With no `TWILIO_*` keys, phone codes go
to the recording SMS fake; with no `EMAIL_HOST` (or under any test run, even
if `EMAIL_HOST` happens to be set), email codes go to its recording twin,
`providers/emails/fake.ts`. Both read back through the one route,
`GET /api/account/last_code?number=` or `?email=`. Neither fake will boot with
`NODE_ENV=production` - that refuses loudly instead of silently dropping mail.

crm: `POST /api/sms/inbound`, `POST /api/sms/status`, `POST /api/calls/twiml`,
`POST /api/calls/status` (all four form-encoded, mounted before
`express.json()` with their own `express.urlencoded()`, signature-verified,
403 with no body logged); `GET /api/sms`, `GET /api/sms/:id`,
`POST /api/calls/token`, `POST /api/calls/presence`, `GET /api/calls/:id`,
`GET /api/customers/:id/timeline` (all admin, all six added to
`accounts/authorization/admin-routes.json`).

### The twelve states, and what feeds each

`VerificationView` feeds nine of them from one shape — `purpose`, `channel`,
`destination` (always masked), `code_length`, `expires_at`, `resend_at`,
`attempts_remaining`, `locked_until`, `status`
(`sent` | `invalid` | `verified` | `locked`). OTP error is `status: 'invalid'`
plus `attempts_remaining`; Locked is `status: 'locked'` plus `locked_until`;
OTP success is `status: 'verified'`. Confirmed is `ChangeConfirmedView`, whose
`next_value` is the one unmasked value in the whole surface. Session expired is
a 401. Change email and change phone answer a `VerificationView` for the code
sent to the OTHER factor.

The constants behind them, all in `accounts/auth/rules.ts`: six digits, ten
minutes to expire, thirty seconds to resend, five attempts, a fifteen-minute
lockout, a five-minute step-up window, three sends per number per fifteen
minutes and ten per IP per hour.

### Contracts

`packages/contracts/src/computed/auth.ts` — `OtpPurpose`, `VerificationStatus`,
`SendCodeBody`, `VerifyCodeBody`, `SignUpBody`, `ChangeEmailBody`,
`ChangePhoneBody`, `ConfirmChangeBody`, `VerificationView`,
`ChangeConfirmedView`, `SessionView`.
`computed/crm.ts` — `SmsMedia`, `SmsInbound`, `SmsStatus`, `CallStatus`,
`CallToken`, `TimelineKind`, `CustomerTimeline`.
`computed/documents.ts` gained `VoicemailReceivedMail`. Generated rows:
`AuthOtpThrottle`, `AuthPendingChange`, `AuthPendingSignup`, `SmsMessage`,
`Call`, and `Session` grew `factor_changed` / `stepped_up_at`.

`@dorado/client` gained `useSendCode`, `useVerifyCode`, `useSignUp`,
`useStepUp`, `useChangeEmail`, `useChangePhone`, `useConfirmChange` and
`useSession`, plus a `keys.auth` namespace.

### Migrations

- **142** `the_code_is_the_only_key` — `auth.users.phone_number_verified` and a
  unique partial index on `phone_number`; `auth.sessions.factor_changed` and
  `stepped_up_at`; `auth.otp_throttles` (one table for the lockout fact and both
  send limits, keyed by `subject`); `auth.pending_changes`;
  `auth.pending_signups`; four `auth.*` enums.
- **143** `a_conversation_is_one_table` — the `crm` schema, `crm.sms_messages`,
  `crm.calls`, their enums and their access-path indexes.
- **144** `a_voicemail_is_told_to_somebody` — an index on
  `auth.verification (identifier)`, which every OTP check filters on and which
  better-auth's own schema never declared, and the `voicemail_received` label on
  `media.email_kind`.

All three additive, all applied to dev, `lint:migrations` green with no
`allow-destructive` marker. `auth.users.phone_number` was REUSED, not replaced.
Genesis carries 144's two objects by HAND, and `packages/contracts/src/media/
enums.ts` carries the label by hand, for the reason 141 recorded: dev has moved
under this worktree (the lots and refining lanes are at migration 167 with
`lots` and `refining` schemas on dev), so a `dump:schema` regeneration would
pull their schemas into this branch's diff. 142 and 143 WERE regenerated,
before those lanes landed, and that diff is 467 lines of nothing but this
wave's own subject.

### What died

`emailAndPassword` and `sendResetPassword`, `emailVerification`,
`user.changeEmail` and the `magicLink` plugin, all out of
`accounts/auth/client.ts`. `POST /api/account/set_password`, its controller,
`assertMaySetPassword`, `PASSWORD_SESSION_FRESH_SECONDS` and
`tests/set-password.test.ts`. The `verifyEmail`, `resetPassword` and
`changeEmail` raw templates with their three renderers, and
`sendAuthVerificationEmail`. `useSetPassword` in `@dorado/client`. The
hardcoded passwords in `seed-e2e-users.mjs`, replaced by verified phone numbers
on the two seeded accounts.

Nothing in `exchange` was touched, and **no password row in `auth.account` was
deleted** — they simply stop being read. `media.email_kind`'s `auth_verification`
label stays for the same reason 141 gave: an enum label cannot be dropped
without rewriting every row that carries it.

### What the frontend lane must build

Every frame in the Figma "Auth" file, Desktop and Mobile, on
`@dorado/components`, using only the `@dorado/client` hooks above. The old
routes `/authentication`, `/change-password`, `/reset-password`,
`/change-email`, `/verify-email` and `/verify-login` are deleted and replaced.

**The frontend is BROKEN by this lane and that is deliberate (ruling 44); it is
listed, not fixed.** `useSetPassword` is gone, so
`frontend/app/verify-login/_src_/ui/SetPasswordForm.tsx` and
`frontend/shared/ui/ChangePasswordForm.tsx` no longer typecheck, and with them
`frontend/app/(credentials)/change-password/page.tsx`,
`frontend/app/(credentials)/reset-password/_src_/ui/ResetPasswordForm.tsx`,
`frontend/app/verify-login/page.tsx` and `frontend/app/(credentials)/layout.tsx`.
`frontend/shared/hooks/auth/authClient.ts` and `queries.ts` still call
better-auth's password and magic-link methods, which no longer exist.
`frontend/shared/tests/auth.setup.ts` still signs in with a password: it moves
to `send_code` -> read the code from `GET /api/account/last_code?number=` ->
`verify_code`. The gate runs no frontend member, so none of this fails it.

### What Jacob must configure

Env keys, none present and none needed to boot (the recording fake is the
default and the real adapters refuse to construct without their keys):
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`,
`PUBLIC_API_URL` (the URL the webhook signature is checked against — it must be
the public one, never the `Host` header), `SMS_PROVIDER=twilio`,
`TURNSTILE_SECRET_KEY` (with `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the frontend),
`TRUST_CLOUDFLARE=1`.

Twilio console, on the one business number: Messaging webhook
`POST {PUBLIC_API_URL}/api/sms/inbound`, status callback
`POST {PUBLIC_API_URL}/api/sms/status`, Voice webhook
`POST {PUBLIC_API_URL}/api/calls/twiml`, call status callback
`POST {PUBLIC_API_URL}/api/calls/status`. A **TwiML App** must be created and
its SID put in `TWILIO_TWIML_APP_SID` — that is the softphone's outbound target.
**It is a documented one-time setup, not a database row**, deliberately: the SID
is an environment credential like the account SID, and dev, UAT and production
each need a different one, which a row shared by every environment cannot give.
A2P 10DLC registration is Jacob's and gates OUTBOUND messaging only; inbound
works at once. Cloudflare's bot rules must allow `/api/stripe`, `/api/sms/*`
and `/api/calls/*` — their own signature checks are the real guard.

**No Figma mailer exists for `voicemail_received`.** It is an internal notice to
staff on the plain base layout, so ruling 95 is not satisfied for it and a
design should be drawn. Ruling 96 is not in play: it governs frontend
components, not a plain notice email.

### Verification

`pnpm check` -> `CHECK_EXIT=1`, with **two failing members and both belong to
other lanes**: `figma:inventory` (pre-existing, Jacob's) and
`contracts:verify:fresh`. Every other member is green - `api-lint` (all 21
lints), `api-test`, `components`.

**276 test files, 1679 passed, 1 skipped.** `audit:silent-mutations` is back at
its ceiling of 14 discarded / 0 unobservable: the two crm status writes now
assert they applied, rather than the ceiling being raised.

The `dev-db` group stops at the first failure, so its remaining members were run
individually. **Five pass**: `audit:coverage`, `audit:indexes`,
`audit:query-paths`, `audit:constraints`, `audit:nullability`. **Five fail, and
every one of them fails on a schema or an enum label this lane did not write** -
the lots and refining lanes are at migration 167 on the shared dev database:

| member | what it says | whose |
|---|---|---|
| `contracts:verify:fresh` | `no entity name for orders.lots` | lots |
| `verify:genesis` | `NATIVE_SCHEMAS does not list: lots, refining` | lots, refining |
| `verify:backfill` | the same line | lots, refining |
| `audit:non-finite` | `lots, refining - present, not in SCHEMAS` | lots, refining |
| `contracts:validate` and `validate:wire` | `fulfillments.methods.category: expected one of SHIPMENT\|PICKUP\|DIRECT` | 167, `a_drop_off_is_a_method` |

None of the five is fixed here, and none of them names a column, table or label
this wave added. This lane's own dev-db question - does the new schema hold the
access paths its queries need - is answered by `audit:indexes` and
`audit:query-paths`, and both are green.
