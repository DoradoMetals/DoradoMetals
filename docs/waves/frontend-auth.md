# The passwordless auth screens (ruling 91, frontend lane)

Jacob: *"you can start with overhauling the frontend. Starting with auth"* and
*"there's the auth screens"*. The API lane is `docs/waves/auth-passwordless.md`;
this is the surface it was built for. Every frame is the Figma file "Auth"
(`hZ5Ajr9Hn1h2Q2XFRa1NYY`, page `0:1`), Desktop and Mobile, read through the
Figma MCP. The copy in the code is the design's copy, verbatim.

## Routes

Eleven screens, all on one shell.

| route | file | state it renders | reached from |
|---|---|---|---|
| `/auth/sign-in` | `app/auth/sign-in/page.tsx` | Sign in | ProfileMenu, Sidebar, `ProtectedPage`, the two basket CTAs |
| `/auth/sign-in/email` | `app/auth/sign-in/email/page.tsx` | Sign in (email) | "Prefer email? Send the code there" |
| `/auth/sign-up` | `app/auth/sign-up/page.tsx` | Sign up | "New here? Create an account" |
| `/auth/verify` | `app/auth/verify/page.tsx` | OTP / OTP (error) / OTP (success) | every send: sign-in, sign-up, change |
| `/auth/verify/step-up` | `app/auth/verify/step-up/page.tsx` | Verify it's you | a stale session hitting `/settings/*` |
| `/auth/locked` | `app/auth/locked/page.tsx` | Locked | any view answering `status: 'locked'` |
| `/auth/session-expired` | `app/auth/session-expired/page.tsx` | Session expired | a 401 |
| `/settings/email` | `app/settings/email/page.tsx` | Change email | account → Details/Security |
| `/settings/phone` | `app/settings/phone/page.tsx` | Change phone | account → Details/Security |
| `/settings/email/confirmed` | `app/settings/email/confirmed/page.tsx` | Confirmed (email) | `confirm_change` |
| `/settings/phone/confirmed` | `app/settings/phone/confirmed/page.tsx` | Confirmed (phone) | `confirm_change` |

Every route folder carries its own `error.tsx` and `loading.tsx`. The shell is
one component, `shared/ui/auth/AuthShell.tsx`, mounted by `app/auth/layout.tsx`
and `app/settings/layout.tsx` — the Panel (520px, p-48, Back top-left, logo and
form centred) with the Pitch beside it from `lg` up, collapsing on mobile to the
Back row, the logo at 104×51 and the form, 32px apart, at 16px gutters. The
Pitch is `bg-card` and empty; that is what the design draws.

`shared/providers/LayoutProvider.tsx` renders `/auth/**` and `/settings/**`
full-bleed: no site nav, no footer, no `max-w-7xl`. The Back control and the
logo are the only chrome those frames have.

## The AuthForm state table

`shared/ui/auth/AuthForm.tsx` is one client component with the twelve states of
the Figma "Auth Form" symbol. It is presentational (ruling 14): it holds no
hooks, fetches nothing and decides nothing. Every number a customer reads comes
off the API's `VerificationView`.

| Figma variant | `state` | fed by | what the API supplies |
|---|---|---|---|
| Sign in | `sign-in` | `/auth/sign-in` | — |
| Sign in (email) | `sign-in-email` | `/auth/sign-in/email` | — |
| Sign up | `sign-up` | `/auth/sign-up` | — |
| OTP | `otp` | `codeStateFor` when `status: 'sent'` and purpose is not `step_up` | `destination` (masked), `code_length`, `resend_at` |
| OTP (error) | `otp-error` | `status: 'invalid'` | `attempts_remaining` |
| OTP (success) | `otp-success` | `status: 'verified'` | — |
| Verify it's you | `verify-its-you` | `purpose: 'step_up'`, `status: 'sent'` | `destination` (masked), `channel` |
| Change email | `change-email` | `/settings/email` | — |
| Change phone | `change-phone` | `/settings/phone` | — |
| Locked | `locked` | `status: 'locked'` | `locked_until` → the cooldown in minutes |
| Confirmed | `confirmed` | `ChangeConfirmedView` | `factor`, `next_value`, `previous_notified` |
| Session expired | `session-expired` | a 401 | — |

`shared/utils/authForm.ts` holds the whole mapping — `codeStateFor(view)`,
`secondsUntil`, `minutesUntil`, `messageOf`, `isStepUpRequired` — and nothing
else. There is no attempts counter, no cooldown constant, no freshness clock and
no "which factor" rule in the browser. Three consequences worth stating:

- **Which words the code screen wears is `view.purpose`, not the state name.** A
  wrong code during a step-up is still "Verify it's you"; only the alert changes.
- **Where its one link goes is `view.purpose` and `view.channel`.** Sign-in by
  SMS gets "Wrong number? / Change it" to `/auth/sign-in`; by email, "Wrong
  email? / Change it" to `/auth/sign-in/email`; a change gets "Changed your
  mind? / Cancel"; a step-up gets "Lost access? / Contact support".
- **Step-up is never predicted.** `/settings/email` posts `change_email` and only
  routes to `/auth/verify/step-up` when the API answers `step_up_required`.

## The verification in flight

The code screen has to post back the raw number or address, and the design masks
that value everywhere — so it cannot go on the URL. It lives in
`shared/providers/VerificationProvider.tsx`, mounted inside `LayoutProvider` so
it survives the `/settings/email → /auth/verify` navigation, and holds one thing:
the view in flight, the identity it was sent to, and where the flow returns.

It is flow state, not a cache: a reload empties it and `/auth/verify` replaces to
`/auth/sign-in`, `/auth/verify/step-up` to `/account`, `/settings/*/confirmed` to
`/account`. Nothing is persisted and no store holds server rows (ruling 83).

## Components used

All from `@dorado/components`, nothing hand-styled: `Input` (with `leading`,
`invalid`, `message`), `Button`, `Link`, `Divider` (its labelled form is the
"or continue with" rule), `OTPInput` (cells, the resend countdown and the
"Didn't get it?" line are the component's own), `Alert` (danger and success),
`Checkbox`, `Skeleton` and `EmptyState` for the boundaries. `@dorado/icons`
gained one re-export, `Phone` — the Figma library already carries that icon
(`11:658`), so ruling 96 is satisfied.

Google sign-in stays, through better-auth's social provider. **Apple and
Facebook are omitted**: the design's own note says all three mandate their own
marks and none exists yet.

## Design-system gaps

1. **No component gap.** Every state composes from the existing library. The
   only addition anywhere is the `Phone` icon re-export.
2. **A page title at H4.** The design's heading is Heading/H4 and this system
   carries type on the semantic tag, so the heading is `<h4>` and the form is
   `aria-labelledby` it. There is no tag that is both an `<h1>` and the H4 step.
3. **Locked with no cooldown to read.** The design's alert title is always
   "Try again in 15 minutes". A direct visit to `/auth/locked` has no
   `locked_until`, so the title falls back to "Try again later" rather than
   printing a number nothing verified.
4. **"Wrong email?"** is ours. The design draws only "Wrong number?", which is
   wrong copy over an email destination.
5. **The Confirmed frame is drawn for email only.** The state is factor-driven
   (`ChangeConfirmedView.factor`), so the phone flow gets "Phone changed" /
   "We've let your old number know." at `/settings/phone/confirmed`. Same state,
   noun swapped — worth Jacob's eye, and the frame worth drawing.
6. **The desktop sign-in frame overrides its subhead** to "Enter the phone number
   associated with your account…" while the symbol and the mobile frame both say
   "Enter your phone number and we'll send you a sign-in code." The shorter one
   is used, as the majority and the symbol default.
7. **`attempts_remaining: 1`** is inflected to "1 attempt left". The design only
   drew the plural.

## API gaps (ruling 44 — listed, not bent)

1. **`confirm_change` answers an ERROR for a wrong code, not a `VerificationView`.**
   Every other code check returns a view carrying `attempts_remaining`, so the
   OTP (error) alert can say how many are left. On a factor change it cannot: the
   screen shows the API's own message instead. Making `confirm_change` answer a
   view on a bad code would close it.
2. **A 401 does not route anywhere by itself.** `/auth/session-expired` exists and
   renders, but nothing intercepts a 401 from `@dorado/client` to send the
   customer there. That belongs in `apiRequest`, in the client package, and is
   not this lane's file to change.
3. **An admin cannot change a customer's factor**, correctly — the change needs
   the customer's own session and a code to their other factor. The admin drawer's
   email field is now a disabled `Input`, per the design's read-only rule, and
   "Send Password Reset" is gone with the passwords.
4. **A resend re-runs the captcha.** `send_code` is the only way to send another
   code and it demands a `captcha_token`, so the OTP screen's Resend fetches a
   fresh token. Fine in a browser; it is why the e2e harness cannot use it.

## What was deleted

`app/authentication/**`, `app/(credentials)/**` (change-password and
reset-password), `app/change-email/**`, `app/verify-email/**`,
`app/verify-login/**`, `shared/ui/PasswordRequirements.tsx`,
`shared/ui/ChangePasswordForm.tsx`. `shared/hooks/auth/authClient.ts` lost the
`magicLink` plugin and every password, verification and change-email method;
`shared/hooks/auth/queries.ts` lost `useSignIn`, `useSignUp`, `useChangeEmail`,
`useSendVerifyEmail`, `useVerifyEmail`, `useRequestPasswordReset`,
`useResetPassword`, `useChangePassword` and `useSetPassword`, and gained
`useAdoptSession` — the cache housekeeping a new identity forces, which is all
that was left of `useSignIn`. `useCreateUser` creates the account and stops:
there is no invitation link to send.

`app/account/_src_/users/ui/UserForm.tsx` and `PasswordAndSecurity.tsx` were
rewritten rather than deleted — the account page renders both. Details now shows
the name (editable), and the masked email and phone as disabled Inputs with
"Change" beside them; Security lists the two factors and the active devices.

`shared/types/routes.ts` retired `authentication`, `changeEmail`,
`changePassword`, `resetPassword`, `verifyEmail` and `verifyLogin` and declares
the eleven new paths.

## Tests

- `shared/tests/auth/AuthForm.test.tsx` — the twelve states rendered, pinning the
  design's copy and that every number is the view's. 24 tests.
- `shared/tests/auth/authForm.test.ts` — `codeStateFor` and the countdowns. 10
  tests.
- `app/auth/_src_/tests/authRoutes.test.tsx` and
  `app/settings/_src_/tests/settingsRoutes.test.tsx` — each route page: what it
  posts, where it routes, and what it does with nothing in flight.
- `app/auth/_src_/tests/auth-screens.e2e.ts` — the public screens in a real
  browser: both channels reaching each other, `/auth/verify` bouncing with no
  code in flight, and the surface carrying no site footer. **It does not submit
  a sign-in**: `send_code` runs the captcha and a headless browser is what the
  captcha exists to refuse.
- `shared/tests/auth.setup.ts` — the e2e session, now minted through OTP:
  better-auth's own `phone-number/send-otp`, the code read back from
  `GET /api/account/last_code?number=`, then the real
  `POST /api/account/verify_code`. The seeded numbers are `+15555550100` (admin)
  and `+15555550101` (customer). No password exists anywhere in the harness.

## The e2e run

Against a local API from this worktree (`node api/src/server.ts` on 5000,
`DATABASE_URL` = dev, `SMS_PROVIDER` unset so the recording fake is the
provider) and `next dev` on 3000, after `pnpm --filter @dorado/api seed:e2e`.

**The OTP sign-in works, proven in the harness.** `playwright test
--project=setup` — the real `shared/tests/auth.setup.ts` — passes for both
roles in 7.5s: send-otp, read the code back from
`GET /api/account/last_code?number=`, `POST /api/account/verify_code` answering
`status: 'verified'`, real session cookies written for the admin and the
customer projects. `GET /api/account/last_code` answers 200 with the fake
selected, which is the route existing only because it may.

**THE BROWSER SPECS COULD NOT RUN, AND NOT FOR AN AUTH REASON.** Every route in
the app answers 500 under `next dev`, including the eight new ones. The dev
server prints exactly three errors and nothing else:

```
Export useCheckoutItems doesn't exist in target module
Export useClearCheckoutItems doesn't exist in target module
Export useReplaceCheckoutItems doesn't exist in target module
```

`frontend/shared/hooks/checkout/items/queries.ts` imports those three from
`@dorado/client`, which renamed them to `useCheckoutLots` /
`useReplaceCheckoutLots` / `useClearCheckoutLots` in the lots lane. That file is
imported by `shared/ui/Shell.tsx` — the site nav — which `LayoutProvider`
renders, so the broken module sits in EVERY page's graph and the whole app fails
to compile. No auth file is named in any of it.

**It is not a rename, which is why it is not fixed here.** The mutation payload
went from `{ items }` to `{ lots }` and the row type from `CheckoutItem` to
`Lot`, so repairing it means converting `shared/utils/basket.ts` and every card,
stepper and drawer that reads a basket line — the lots lane's own frontend pass,
which `docs/waves/lots-build.md` says is deliberately not done. Doing half of it
here would put unverified money behaviour on the buy and sell surfaces.

So `app/auth/_src_/tests/auth-screens.e2e.ts` is written and unrun, and the
authed journeys are unrun. They need one thing: the lots lane's frontend pass.
Everything the auth lane itself owns in that harness — the OTP sign-in — is
green.

## Typecheck

`pnpm --filter @dorado/frontend typecheck`, with `@dorado/contracts` built
first (without that build every file reports `Cannot find module`, which is why
a raw run reports 175):

- **Before: 55 errors.** One was auth's —
  `shared/hooks/auth/queries.ts: Module '"@dorado/client"' has no exported
  member 'useSetPassword'`, the breakage the API lane listed.
- **After: 54 errors, none in an auth file.**

Every one of the 54 belongs to the lots and payment-rails lanes:

| file | errors |
|---|---|
| `app/admin/_src_/orders/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerFooter.tsx` | 7 |
| `app/admin/_src_/orders/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editRefinerValues.tsx` | 7 |
| `app/account/_src_/orders/purchaseOrders/purchaseOrderDrawer/purchaseOrderDrawerFooter.tsx` | 7 |
| `app/admin/_src_/orders/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminReceived.tsx` | 6 |
| `shared/hooks/refiners/queries.ts` | 5 |
| `app/admin/_src_/orders/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editActualValues.tsx` | 4 |
| `shared/hooks/checkout/items/queries.ts` | 3 |
| `app/admin/_src_/orders/salesOrders/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPreparing.tsx` | 3 |
| `shared/hooks/useSalesOrderLines.ts` | 2 |
| `app/admin/_src_/orders/salesOrders/queries.ts` | 2 |
| `app/admin/_src_/orders/purchaseOrders/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/adminPurchaseOrderActionButtons.tsx` | 2 |
| `app/account/_src_/orders/salesOrders/salesOrderCard.tsx` | 2 |
| `app/account/_src_/orders/purchaseOrders/purchaseOrderDrawer/drawerContents/Received.tsx` | 2 |
| `app/admin/_src_/tests/orders/actionButtons.test.tsx` | 1 |
| `app/account/_src_/orders/purchaseOrders/purchaseOrderCard.tsx` | 1 |

They are `useCheckoutItems` → `useCheckoutLots`, `useRefinerOrder` →
`useRefiningOrder`, `OrderView.items` moving under the lots model, and the
payment-rails renames. None is auth's and none is fixed here.
