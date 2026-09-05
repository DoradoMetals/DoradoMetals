# Stripe 18 -> 22 — the deferred major, taken

2026-09-06, branch `stripe-lane`, worktree `/home/jtj60/dorado-lanes/stripe`.

D203 deferred this one on purpose: *"four majors of pinned-API-version drift on
the money path get test-mode traffic first, never an overnight merge."* Jacob,
2026-09-06: *"Def need to upgrade those."* So it was taken here, against the
real Stripe **test-mode** sandbox, with `test:external` as the evidence the
replay lane cannot give.

Production was not touched. No migration was written. No live key exists in this
worktree — `api/.env` holds `sk_test_...` and the external lane refuses to run
on anything else.

---

## 1. Versions

| package | before | after | pin |
|---|---|---|---|
| `stripe` (api) | `^18.5.0` | **`22.6.1`** | EXACT |
| `stripe` (frontend) | `^18.5.0` | **`22.6.1`** | EXACT |
| `@stripe/stripe-js` | `^7.9.0` | **`9.15.0`** | EXACT |
| `@stripe/react-stripe-js` | `^3.10.0` | **`6.9.0`** | EXACT |

**All four are pinned exact, the way better-auth is** (D203's own lesson: *"an
in-range bump is only as safe as the distance between the manifest and the
lockfile"*). A caret here would let the money path float across a minor nobody
ran the sandbox against. `pnpm install`, not frozen; the lockfile moved 60 lines
and nothing else in the tree changed version.

The frontend carries `stripe` because `@better-auth/stripe` peer-depends on it.
That peer is `^18 || ^19 || ^20 || ^21 || ^22` at 1.6.9, so 22 is in range and
better-auth's own pin does not move. The plugin is handed **our** client
(`api/identity/auth/client.ts` imports `#providers/payment/stripe-client.ts`),
so there is exactly one Stripe client in the API and exactly one API version.

## 2. The API version, now pinned rather than inherited

There was never an `apiVersion` in this repo — the SDK's default applied, which
is why "four majors of drift" was invisible: upgrading the package silently
moves the wire format.

- stripe 18 default: `2025-08-27.basil`
- stripe 19: `2025-10-29.clover` · 20: `2025-11-17.clover` · 21: `2026-03-25.dahlia`
- stripe **22.6.1** default: **`2026-08-26.dahlia`**

`api/providers/payment/stripe-client.ts` now pins it explicitly:

```ts
const API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";
```

`Stripe.LatestApiVersion` is a literal type equal to the version *that SDK*
ships, so the next `stripe` bump **fails to compile here** instead of changing
what Stripe returns at runtime. That is the tripwire D203 wanted and did not
have.

## 3. Every breaking change met, and how

### stripe-node

| major | breaking change | met? |
|---|---|---|
| 19 | pinned version -> `2025-10-29.clover` | subsumed by the 22 pin above |
| 20 | v2 array params serialise indexed (`include[0]=`) | **not used** — no v2 calls |
| 21 | `decimal_string` fields become `Stripe.Decimal` | **not used** — every field this repo reads (`id`, `status`, `amount`, `amount_received`, `client_secret`, `metadata`, `livemode`, `currency`) is an integer, string or map. `StripeIntentLike` is unchanged. |
| 21 | webhook parsing throws on the wrong method | **already correct** — `verifyWebhook` calls `webhooks.constructEvent`, the snapshot-event method, and this account sends snapshot events |
| 21 | dedicated OAuth error classes; Node 16 dropped | **not used** / Node 24 |
| 22 | `Stripe` is a true ES6 class, `new Stripe()` required | **already** `new Stripe(...)` |
| 22 | callbacks removed | never used any |
| 22 | `RequestOptions` must be the LAST argument; per-request `apiKey`/`host` moved | **no call site affected** — every call is `(params, options)` or `(id)`; `createIntent` already passes `{idempotencyKey}` as the second, options argument |
| 22 | `Stripe.StripeContext` -> `StripeContextType`; `errors.StripeError` type form | not referenced |
| 22 | removed `StripeResource` internals (`extend`, `method`, …) | not referenced |
| 22 | **`HttpClient` / `HttpClientResponse` are no longer generic** — they are now the interfaces `HttpClientInterface` / `HttpClientResponseInterface` | **THE ONLY CODE BREAK.** See below. |

**The one code break, in full.** `stripe-client.ts` installs a custom HTTP
client during test runs (`immediateWriteHttpClient`) so that `nock` sees the
request body written immediately rather than buffered. It was typed
`Stripe.HttpClient<Stripe.HttpClientResponse<NodeResponse, NodeResponse>>`.
v22 made both non-generic, which produced **11 errors from 2 causes**: two
`TS2315 "Type ... is not generic"`, and nine `TS7006 implicit any` cascading
from `makeRequest`'s eight parameters losing their contextual types once the
interface failed to resolve.

The fix is the type annotations only — `Stripe.HttpClient` and
`Stripe.HttpClientResponse`, no type arguments. **The five response methods and
`makeRequest`'s eight arguments are byte-identical between v18 and v22**, so the
body of both functions is unchanged. Node's `NodeHttpClient` is still the SDK's
default transport on this platform (`createDefaultHttpClient()` returns it), so
nock still intercepts, and no fetch-based interception question arises.

After the annotation change: **`api` typecheck 0 errors** (baseline was also 0,
with `@dorado/contracts` built).

### @stripe/stripe-js 7 -> 9

- **v8** breaking: Checkout SDK types, `redirectToCheckout` types removed,
  `elements` mode params became a discriminated union, Clover element types
  removed. **None used** — this app uses Elements + PaymentElement on Payment
  Intents, not the Checkout Sessions API.
- **v9** breaking, and it bit: *"Remove boolean from RadiosOption type for
  Dahlia"*. `layout.radios` on `StripePaymentElementOptions` went from `boolean`
  to `'auto' | 'never' | 'always' | 'if_multiple'`.
  `StripePaymentForm.tsx` passed `radios: false`; it now passes **`'never'`**,
  which is the same rendering — the accordion keeps `spacedAccordionItems` and
  no radio buttons.
- v9 also removed `createSource`/`retrieveSource` types and made
  `elements.update()` return a promise. Neither is used.

### @stripe/react-stripe-js 3 -> 6

**Every breaking change in 4, 5 and 6 is on the Checkout Sessions surface** —
the `/checkout` entrypoint split, `useCheckout`'s disjoint-union return,
`CheckoutProvider`'s new shape, `createEmbeddedCheckoutPage`, and Dahlia type
updates. This repo imports `Elements`, `PaymentElement`, `useStripe` and
`useElements` only, none of which changed. Peer ranges are satisfied:
`@stripe/stripe-js >=9.10.0 <10`, `react >=16.8 <20` against React 19.2.

**Nothing else in the frontend was touched.** `StripeWrapper.tsx`,
`appearance.ts`, `loadStripe` typing and both `loadStripe` call sites compile
unchanged.

## 4. What did NOT change, and had to be checked

Webhook signature verification and idempotent intent creation are the two
behaviours D203 was protecting. Both are byte-for-byte the same call:

- `verifyWebhook` -> `stripeClient.webhooks.constructEvent(rawBody, signature,
  STRIPE_WEBHOOK_SECRET)`. v22's `WebhookPayload` is `string | Uint8Array`, and
  `Buffer` is a `Uint8Array`, so the raw-body path is unchanged.
  `generateTestHeaderString` still exists and the tamper/wrong-secret tests
  still throw. **Proven against the sandbox**, not just in replay.
- `createIntent` -> `paymentIntents.create(params, {idempotencyKey})`, with
  `metadata` carrying **`type`, `user_id`, `session_id`** (D25's reconciliation
  lifeline). The recorded request body proves the key stayed where it belongs:
  it is a request *header*, and the two-calls-one-intent assertion passes live.

## 5. Cassettes: 5 re-recorded, and a landmine found

**The request bodies did not change at all.** The whole cassette diff contains
**zero** changed `"body"` lines — v22 form-encodes every call this repo makes
exactly as v18 did. That is why the old cassettes still matched, and why the
suite was green before a single cassette was touched (237 files / 1343 tests).

They were re-recorded anyway, because a passing replay against basil-era
responses proves nothing about dahlia. Re-recorded against the sandbox on
22.6.1:

```
stripe/create-intent-idempotent.json
stripe/create-payment-intent.json
stripe/update-intent-amount.json
stripe/cancel-intent.json
stripe/cancel-unknown-intent.json
stripe/retrieve-unknown-intent.json
```

Six files (five scenarios plus the shared unknown-intent pair). **The only new
response field across all four majors is `payment_record: null` on
`PaymentIntent`.** Everything else that moved is a per-run object id, timestamp,
`invoice_prefix`, or `request_log_url` request id — the same test-mode account
(`acct_1RFLhK…`) the README already documents as unscrubbed and harmless. No
new customer-shaped value entered any file; the scrubbing is unchanged.

### The landmine: `test:record` destroys hand-written cassettes

Two Stripe cassettes are **synthetic, not recorded** —
`cancel-intent-transient-error.json` (an intent Stripe reports as `processing`)
and `self-heal-stale-intent.json` (an already-canceled intent under a fixed id).
The sandbox will not produce either state on demand. `nock.back`'s `update`
mode DELETES a fixture and re-records it from whatever the sandbox says now, so
the recording run replaced the transient-error state with a plain
`resource_missing` 404 and its assertion (`/status of processing/i`) went red.
It was restored from backup by hand.

`shared/testing/cassettes.ts` now carries a `SYNTHETIC` set and drops to
`lockdown` for those two names **even during a recording run**, so
`pnpm test:record` replays them instead of overwriting them. Proven: a
`RECORD_CASSETTES=1` run of that one test passes with the fixture byte-identical
(md5 unchanged).

## 6. A pre-existing failure this lane surfaced (not the SDK's)

`test:external`'s fourth case asserted that cancelling an id Stripe never issued
**rejects**. It does not, and has not since **2026-09-03, commit `4cd75534`**,
which taught `cancelIntent` to swallow `resource_missing` / "already canceled"
on purpose: to every caller those are the same STATE, and the sweeps plus
`cancelIntentByRef` need cancelling to be idempotent. The cassette lane already
asserted the swallowing behaviour; the external lane still asserted the old one.
Nothing caught the contradiction because **`test:external` is not in
`pnpm check`** — it needs the network and the sandbox.

The test now asserts what the provider actually promises: cancel resolves as
already-canceled, retrieve still throws. **No behaviour changed.** This is
recorded here rather than buried because it is the second time a lane has found
the sandbox suite drifting behind the code it covers.

## 7. Evidence

| lane | result |
|---|---|
| `api` typecheck | 0 errors (baseline 0) |
| `api` suite, offline replay, new cassettes | **237 files / 1343 passed, 1 skipped** |
| `test:external` Stripe cases, live sandbox | **5/5 pass** |
| `RECORD_CASSETTES=1` guard proof | synthetic cassette md5 unchanged, test passes |
| frontend typecheck | **183 errors before, 183 after — the identical error set, line for line** |

The 183 are pre-existing (rulings 79/80 and the orders pass); this lane
introduced one new error and fixed it, and removed none of the others.
`docs/waves/orders-pass-2.md` and the ruling-79/80 notes own those.

## 8. What Jacob must click through in a browser

The replay lane and the sandbox lane both prove the **server** half. Neither
renders an iframe. Stripe Elements draws inside Stripe's own origin, so the
`@stripe/stripe-js` 7 -> 9 and `@stripe/react-stripe-js` 3 -> 6 majors can only
be confirmed by eye, with a test card (`4242 4242 4242 4242`, any future expiry,
any CVC, any ZIP):

1. **Customer checkout, bullion or scrap, to the payment step.** The
   PaymentElement must render **DARK** (`StripeWrapper.tsx` pins
   `theme = 'dark'` unconditionally — a light form in a near-black checkout is
   the exact regression its comment warns about; MANUAL-VERIFICATION.md R12).
2. **The accordion layout.** `radios: 'never'` replaced `radios: false`: the
   accordion items must still be spaced and must show **no radio buttons**. If
   radios appear, the enum mapping is wrong.
3. **Pay with the test card and let it settle.** Confirms create-then-charge
   end to end: the order is created *awaiting payment* first, the charge is
   last, and `onSuccess` routes to `/order-placed`.
4. **Submit once with a declined card (`4000 0000 0000 0002`), then again with
   a good one.** The order must NOT be created twice — `createdOrderRef` makes
   the retry payment-only.
5. **The admin drawer's sales-order create**, same form, and check the billing
   details belong to the **target customer**, never the admin driving it (D206).
6. **A live webhook.** `payment_intent.succeeded` must move the order to
   *Preparing* and send the confirmation email. This is the one path where the
   pinned `2026-08-26.dahlia` version reaches the app from Stripe's side rather
   than ours, and it is worth watching once with the Stripe CLI.
