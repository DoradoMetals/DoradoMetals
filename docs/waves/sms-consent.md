# SMS consent capture for the A2P 10DLC campaign (consent-lane, 2026-09-22)

Carriers require a shown, unchecked-by-default opt-in checkbox with exact
wording before they approve a 10DLC campaign (`docs/design/a2p-campaign.md`).
This wave adds the consent fact to the database, the sign-up checkbox, the
legal pages the campaign references, and - after two rulings from Jacob mid
build - a request/reply consent flow instead of an outbound refusal.

## Ruling 112, mid-build: no refusal on business judgment

The original ask was a hard refusal - decline to text anyone with no consent
on file. Jacob overrode that: texting a customer or lead with no consent is
allowed. What ships instead is one new admin action,
**`POST /api/sms/consent_request`** (`user_id` or `lead_id` in the body),
which sends *"Dorado Metals: Reply YES to receive texts about your quote and
orders. Message frequency varies. Message and data rates may apply. Reply
STOP to opt out, HELP for help."* through `crm/sms/service.ts`'s normal
`sendMessage`, so it lands in `crm.sms_messages` like any outbound text. No
refusal rule exists in this tree - `sendToCustomer` sends regardless of
consent, gated only by having a phone number at all. A UI button for this
("Ask for consent" on the customer/lead screens) is not built - API only,
per Jacob; that is design work for later.

## The database

Three migrations, applied to dev:

- **229** (`auth.users`, `auth.pending_signups`) - `sms_consent_at
  timestamptz`, `sms_consent_method text` (CHECK, widened by 231) on
  `auth.users`; `sms_consent boolean not null default false` on
  `auth.pending_signups`, carrying the sign-up checkbox answer from the
  `sign_up` call to the `verify_code` call that creates the account (same
  pattern name/email already use on that table).
- **230** (`leads.leads`) - the same two columns, so a lead can consent
  before ever becoming a customer.
- **231** - widens both CHECK constraints from `('web_form', 'verbal')` to
  add `'via_text'`, the method an inbound reply stamps.

`sms_consent_method` is `web_form` (the sign-up or, eventually, checkout
checkbox), `verbal` (a staff member reads the script on a call and marks it
on the lead PATCH), or `via_text` (an inbound YES/START/Y to our own text).

## Where consent gets stamped

All three writes to `auth.users.sms_consent_at` go through
`db/auth/users/repo.ts`'s `recordSmsConsent(id, at, method, tx)` /
`clearSmsConsent(id, tx)`, and each site sends the opt-in welcome text -
*"Welcome to Dorado Metals account and order texts. Message frequency
varies. Message and data rates may apply. Reply HELP for help, STOP to
cancel."* - after its transaction commits, as `attempt` work, whenever the
user has a phone number:

1. **Sign-up** (`accounts/auth/service.ts::verifyCode`) - `sms_consent: true`
   on the `sign_up` body is held on `pending_signups.sms_consent`, and
   stamped as `web_form` the moment the account is created.
2. **Lead conversion** (`accounts/users/service.ts::createFromLead`, called
   from `crm/leads/service.ts::convert`) - copies the lead's own
   `sms_consent_at`/`sms_consent_method` onto the new customer verbatim (the
   original timestamp, not the conversion moment).
3. **Inbound reply** (`crm/sms/service.ts::receiveInbound`) - STOP /
   UNSUBSCRIBE / CANCEL / END / QUIT null `sms_consent_at` (method
   untouched, so the history of how consent was first given survives a later
   opt-out); START / YES / Y stamp `sms_consent_at = now()` with method
   `via_text`. The match tries `auth.users` by phone first, then
   `leads.leads` by phone (a lead who never became a customer can still
   consent or opt out by text; `db/leads/repo.ts` gained `byPhone` for this).

The admin lead PATCH (`PATCH /api/leads/:id`) accepts `sms_consent_method:
'verbal'` to stamp consent (server-stamped timestamp, never client-supplied)
or `null` to clear it; this path does **not** send the welcome text (the
lead isn't a customer yet).

`GET /api/account/me` (`AccountProfile`) now carries `sms_consent_at` and
`sms_consent_method`.

## Sign-up form (`frontend/app/auth/sign-up`, `shared/ui/auth/AuthForm.tsx`)

An unchecked-by-default `Checkbox` (already in `@dorado/components`, no new
component needed) with the exact campaign wording: *"I agree to receive text
messages from Dorado Metals about my account and orders. Message and data
rates may apply. Message frequency varies. Reply STOP to cancel, HELP for
help."* Sent as `sms_consent` in the `sign_up` body; optional, sign-up
proceeds without it. On the verify-code screen, when the box was checked and
a phone was given, one line appears under the subtitle: *"You're opted in to
texts. A confirmation text is on its way."*

**Also this wave, on Jacob's instruction**: the sign-up phone field is no
longer disabled. It dropped the "Text sign-in coming soon" helper and now
sends `phone_number` like any other optional field - the API already
accepted it (`SignUpBody.phone_number` has been optional since the
email-first wave). This is scoped to sign-up only: `PHONE_SIGN_IN_LIVE` is
unchanged, so **sign-in stays email-first** until the campaign is approved;
the two sign-in screens (`/auth/sign-in`, `/auth/sign-in/phone`) do not
change.

## Legal pages

`frontend/app/privacy-policy` and `frontend/app/terms-and-conditions` did
not exist; both are new (plain page/error/loading trio each, ruling 83). The
privacy page carries the carrier-required sentence verbatim: *"Mobile
information will not be shared with third parties or affiliates for
marketing or promotional purposes."* plus the STOP/HELP lines; the terms
page also carries the STOP/HELP lines. **Both are plain, factual copy - no
lorem ipsum - and need Jacob's legal review before they are load-bearing.**

Short paths redirect to the long ones (`next.config.ts` `redirects()`):
`/privacy` -> `/privacy-policy`, `/terms` -> `/terms-and-conditions`. The
sign-up checkbox's own Terms/Privacy links already pointed at the long paths
before this wave.

## Skipped, and why

- **Checkout.** No screen on this branch collects or confirms a phone at
  order placement (`frontend/app` has no checkout route yet), so the
  checkbox is not wired there. `auth.users.recordSmsConsent` is ready for
  whichever write lands first when that screen is rebuilt.
- **Public lead/sell form.** Does not exist on this frontend (the sell flow
  isn't built) and there is no unauthenticated lead-creation endpoint today
  (`POST /api/leads` is `requireAdmin`-only) - so there is no lead-form
  checkbox UI to add. The leads columns and the admin verbal path are fully
  wired and tested regardless, ready for whenever that form exists.

## Figma deviations

- The sms-consent checkbox is the same deviation the existing terms checkbox
  already carries (`docs/waves/email-first.md`'s note, and ruling 96): not a
  new component, but the specific combination (a second checkbox, this
  wording) has no frame in the Auth Form file. Needs the same five-minute
  Figma look.
- The sign-up phone field losing its disabled "coming soon" state actually
  **resolves** the prior deviation from the email-first wave, rather than
  adding one - it now matches the library `Input`'s plain default state.

## Screenshots

Taken with Playwright against local dev servers on non-default ports
(API on `:5010`, frontend on `:3010`, `FRONTEND_URL`/`NEXT_PUBLIC_API_URL`
pointed at each other so CORS and the sign-up call both work), 1440px wide:

- `/tmp/claude-1000/-home-jtj60-dorado-exchange/38d118cb-3136-4d6d-8b42-7b9dc267a5a7/scratchpad/consent-signup.png`
  - the sign-up form, consent box unchecked, full wording and the
    Terms/Privacy links visible, phone field enabled.
- `/tmp/claude-1000/-home-jtj60-dorado-exchange/38d118cb-3136-4d6d-8b42-7b9dc267a5a7/scratchpad/consent-after-submit.png`
  - the verify-code screen after submitting with the box checked and a
    phone given, showing the "You're opted in to texts" line.

These are in the session scratchpad, not the repo - Jacob should save copies
wherever the Twilio registration packet lives before the sandbox is
reclaimed.

## Tests

- API: `db/auth/pending-signups` create carries `sms_consent`;
  `accounts/auth/tests/verify-code.test.ts` - checked box stamps `web_form`
  and sends the welcome text (checked against the fake provider), unchecked
  leaves both null; `crm/sms/tests/webhook.test.ts` - STOP and its four
  synonyms clear consent, START re-sets it as `via_text` and sends the
  welcome text, a bare `Y` stamps a *lead* matched by phone (no user), an
  unmatched number touches nothing; `crm/sms/tests/send.test.ts` - sending
  to a consentless customer or lead succeeds (ruling 112), `lead_id` and
  `user_id` both work, `consent_request` sends the opt-in text and records
  it for both a user and a lead, and needs exactly one id;
  `crm/leads/tests/convert.test.ts` - conversion carries consent and method
  onto the customer and sends the welcome text, no consent carries none;
  `crm/leads/tests/endpoints.test.ts` - the admin PATCH's `verbal` stamps a
  timestamp, clearing nulls it, an unknown method is refused.
- Frontend: `AuthForm.test.tsx` and `authRoutes.test.tsx` - the new
  checkbox's wording and default state, the enabled phone field and its
  E.164 payload, `sms_consent` true/false on submit.
- `admin-routes.json` gained `POST /api/sms/consent_request` (reviewed,
  admin-only).
- `scripts/lint-no-literal-views.ts` gained two accepted entries
  (`crm/leads/service.ts`, `crm/sms/service.ts`) for the `{ row, boolean }`
  pairs that carry a post-commit send decision out of a transaction.

## Verification

- `pnpm --filter @dorado/api typecheck` - clean.
- `pnpm --filter @dorado/api test` - 318 files, 2027 passed.
- `pnpm --filter @dorado/frontend typecheck` - clean except two pre-existing,
  unrelated errors in `app/admin/_src_/orders/tests/fixtures.ts` (an order
  profit shape drift from another in-flight lane's migrations 227-228,
  confirmed via `git log` on that file - not touched by this wave beyond the
  one `AdminUser` fixture that needed the two new columns).
- `pnpm --filter @dorado/frontend test` - 12 files, 194 passed.
- `pnpm check:fast` from the worktree root - **PASS, `CHECK_EXIT=0`**.
