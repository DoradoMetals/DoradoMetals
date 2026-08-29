# Overnight Lane B — the 117 JavaScript tests become TypeScript

Scope: **test files only**. Every `*.test.js`, `*.test.ts`, `*.test.tsx`, every
`tests/` directory, and `api/types/*.d.ts`, across the whole repo. No source
file is mine; three other lanes hold `api/features/**`, `frontend/**` and
`scripts/**` concurrently.

Branch state at start: `002c0f0f` (+ an uncommitted CLAUDE.md edit that is not
mine). Baseline: 117 `.test.js`, 21 `.test.ts`, `typecheck` clean.

```
B1. supertest.d.ts completes the surface  ██████████████████  100%
B2. Order mutation surface (PATCH) tests  ██████████████████  100%
B3. features/orders/tests, all of it      ██████████████████  100%
B4. The rest of features/**/tests         ██████████████████  100%
B5. Loose tests: relocate AND convert     ████████████████░░   93%
B6. shared/ providers/ scripts/ db        ░░░░░░░░░░░░░░░░░░    0%
```

**Converted: 89 / 117** — `.test.js` went 117 → 28, `.test.ts` went 21 → 110.
**Twelve defects filed**, two of them tests that were green while asserting
nothing (L-B8, L-B10), and one coverage gap on the payments money path (L-B9).
**`pnpm --filter @dorado/api typecheck` is clean.** Every test under
`api/features/**` is TypeScript except two, and every one is grouped under a
`tests/` folder (ruling 31). Baseline confirmed before starting: **934 tests, 934
pass, 0 fail**, `typecheck` clean.

**B1 was already done.** `types/supertest.d.ts` declares `patch` — wave 5A
added it (D136) and the brief predates that. Nothing to do; the whole PATCH
surface below is typechecked for the first time as a result.

## Defects the conversion surfaced

*(appended as found — this is the deliverable)*

### L-B0 — `shared/testing/pinned-pool.d.ts` and `session.d.ts` are dead files that disagree with their implementations

Both helpers are `.ts` now. The hand-written `.d.ts` beside each is **ignored
by tsc** — verified by attack, D134-style: a probe assigning
`assertNothingEscaped(...)` to `string` fails with *"Type 'number' is not
assignable"*, i.e. the compiler is reading the `.ts` (`Promise<number>`), not
the `.d.ts` (`Promise<void>`).

They disagree in three places, and one of them matters:

| | `.d.ts` says | the `.ts` actually is |
|---|---|---|
| `assertNothingEscaped` | `Promise<void>` | `Promise<number>` |
| `inPinnedTransaction` opt | `{ lock?: string }` | `{ lock?: number \| number[] }` |
| `as(user, fn)` | `fn: () => Promise<T>` | `fn: () => Promise<T> \| T` |

`assertNothingEscaped` is the live hazard. Its name says *assert*; it does not
assert, it **returns a count** the caller must check. Had the `.d.ts` been the
one in force, `await assertNothingEscaped(t, p)` on its own would typecheck as
a completed assertion while asserting nothing. It is **not** in force, and
all 21 live call sites do use the count — checked, so this is a latent trap
rather than a live one; `session.d.ts`'s own header names the risk
("it can omit an export and nothing notices").

Both files are source, not test, so I have not touched them. **They should be
deleted** — the implementations they describe are typed.

**CLOSED**: another lane deleted both while this pass was running. Recorded
because the reasoning is the deliverable, not the diff.

### L-B1 — `refusedField` returns `| null` and `patch.test.js` dereferenced it five times

`features/orders/patch.service.ts`'s `refusedField(direction, body)` returns
`{ statusCode, message } | null`. The order-PATCH document test read `.message`
off the result **five times with no check**, and twice more after only an
`assert.equal(x?.statusCode, 400)` — which is not a narrowing guard.

If the shape check ever stopped firing, every one of those lines threw
`Cannot read properties of null` instead of saying *"the shape check did not
fire"*. Red either way, but the message named nothing. Fixed by guarding each
one (`assert.ok(refusal, …)` plus a `shapeRefusal()` helper that names the
field it was probing). No assertion changed.

**File**: `api/features/orders/tests/patch.test.ts`.

### L-B2 — `finalize-pricing` handed a possibly-undefined order to the pricing module, and never established the payout it prices from

Two defects on the `$26.81` pin, both on the money path.

1. `purchaseOrderService.getPurchaseById(order.id)` returns
   `ComposedOrder | undefined` and went **straight into**
   `calculateTotalPrice(priced, spots)`. An order the API could not read back
   produced a TypeError inside the pricing module rather than naming the failed
   read. Guarded.

2. **The bigger one.** `calculateTotalPrice` ends with
   `baseTotal - shipping - order.payout.cost` and declares
   `payout: { cost: number }`. The composed read it is fed declares
   `payout: Record<string, any>` — nothing promises the key exists, and an
   absent one makes the **whole total `NaN`** rather than throwing.

   The live caller does not close that gap, it *asserts* it away:
   `features/orders/service.ts` declares
   `type OrderLike = PurchaseOrderRow & Record<string, any> & { payout: { cost: number } }`
   — an intersection onto a row that does not promise it. So the only thing
   standing between an order with no payout row and a `NaN` total is a type
   annotation that was written to make the call compile.

   The test now **establishes** it (`typeof payout?.cost === "number"`) instead
   of assuming it. **The source gap stands and is not mine**: either
   `ComposedOrder.payout` should be typed with its `cost`, or
   `calculateTotalPrice` should refuse a payout it cannot read rather than
   returning `NaN`. A `NaN` total is D65's shape again — a number on one read
   path and a string on the other.

**File**: `api/features/orders/tests/finalize-pricing.test.ts`.

### L-B3 — `parity.test.js` guarded a nullable fixture in ONE of its nine tests

`bothWays(c)` returns `null` when dev has no user with an address. **Nine tests
call it. One checked.** The other eight went straight to `placed.legacy_id` /
`placed.next.order_id`.

This is `refiner-spots` again (D136), at three times the scale and on the file
that pins *both order-creation paths agreeing* — the one that covers
`create_purchase_order`, which the replay tests deliberately do not drive.
Without the guard, a dev database missing the fixture fails eight tests with
`Cannot read properties of null` and names nothing. All nine now guard.

**File**: `api/features/orders/tests/parity.test.ts`.

### L-B4 — `intake.test.js` asserted a key on the wrong half of a union, and its rate fixtures were shapes the contract forbids

Three separate things in one file:

- `out.items[0].bullion_id` — `ScrapItem` **does not declare `bullion_id` and
  `item()` does not set it**. The assertion `=== undefined` passed for the wrong
  reason: it was reading a key that is absent, off a union member that has no
  such property. Replaced with `!("bullion_id" in scrapLine)`, which is the
  stronger claim and the one the test meant.
- The `rates` fixtures omitted `id`, which `Rate` (from `@dorado/contracts`)
  declares as required. `decompose` never reads it, so the fixtures had been
  passing a shape the contract forbids for as long as they have existed.
- `buy.fulfillment.shipment.shipper_address` — **`Fulfillment.shipment` is
  optional** (a pickup or an in-person handoff has none). Six unguarded
  dereferences: a block that decomposed to the wrong category TypeError'd
  instead of reporting which category it got. Guarded.

**File**: `api/features/orders/tests/intake.test.ts`.

### L-B5 — the guard-one-and-not-the-others pattern is systemic, not a `refiner-spots` quirk

D136 found three of `refiner-spots`' four tests missing a guard the first one
had. It is the shape of the whole suite. Counted so far, each one a nullable
value dereferenced with no check:

| file | what returns null | unguarded reads |
|---|---|---|
| `orders/tests/parity` | `bothWays()` | **8 of 9 tests** |
| `fulfillments/tests/service` | `repo.chooseById`, `getForOrder`, `pickupService.schedule` | 11 |
| `orders/tests/purchase-read` | `findPurchaseById`, `.address`, `.scrap`, `.payout` | 7 |
| `orders/tests/address-state` | `getAddressFromId` | 4 |
| `orders/tests/intake` | `Fulfillment.shipment` (optional) | 6 |
| `orders/tests/patch` | `refusedField` | 5 |
| `quotes/tests/order-quote` | two `.find()` on quote lines, one on live spots | 3 |
| `orders/tests/purchase-replay` | `.find()` on the order list | 1 |
| `orders/tests/finalize-pricing` | `getPurchaseById` | 1 |

**Why it matters, restated from D136**: without the guard the test throws
`Cannot read properties of null` and names nothing. It is red either way — so
this is not a correctness bug in the product — but a suite that fails
confusingly is a suite people stop reading. Two of these are on money paths
(`order-quote`'s live-spot lookup; `finalize-pricing`).

All now guarded, with the message the failure should have carried.

### L-B6 — three deliberate contract violations, and each names a signature that is narrower than reality

These are tests that prove a runtime guard refuses a value **the type system
says cannot arrive**. Each is now a `@ts-expect-error` with the reason, which
is self-retiring: fixing the signature makes the directive unused and forces
the note out. That is the `ACCEPTED`-list discipline `audit:indexes` uses.

| call | declared | what the runtime handles, and why it must |
|---|---|---|
| `decompose(null, …)` | `block: Record<string, any>` | its **first statement** is `if (!block \|\| typeof block !== "object")`. `block` is `req.body`. The file's own header says the input type "declines to lie about what arrived" — and then declares it an object. |
| `rateForItem(undefined, …)` | `state: string \| null` | the whole point of `address-state.test`: the live paths passed `undefined`, off a list. **`null` is not a substitute** — the nexus guard reads `state !== null`, so null short-circuits and undefined does not. |
| `adjustCredit(u, "increment", …)` | `mode: CreditMode` | `service.ts` casts the request body with `operation as users.CreditMode`, so an unrecognised mode really does reach the repo. |

Plus one over-declaration, the `bid.ts ComposedItem` shape again:
`updateScrapItem` declares `item: OrderScrapItemRow & Record<string, any>` —
requiring `metal` and `content` — and reads only `item.id`, `item.premium` and
`item.scrap.*`.

**None of these is mine to fix.** Each is a one-line widening (or narrowing) in
`api/features/**`.

**Ten `@ts-expect-error` sites in total**, each with a one-line reason and each
self-retiring. Grep for them to find every place a runtime guard and its own
signature disagree:

```
features/orders/tests/intake.test.ts:281            null is what this guard exists to refuse
features/orders/tests/address-state.test.ts:150     undefined is exactly the value the defect supplied
features/orders/tests/purchase-service.test.ts:183  the declared row is wider than the code reads
features/users/tests/repo.test.ts:100               an unrecognised mode is the point of this test
features/users/tests/credit-target.test.ts:88       an unrecognised mode is the point of this test
features/payments/tests/webhook-updates.test.ts:151 amount_capturable is real and has no home
features/payments/tests/webhook-updates.test.ts:189 amount_capturable is real and has no home
features/shipping/operations/tests/check-pickup-date.test.ts:90  a string is exactly what the defect supplied
features/rates/tests/resolveRate.test.ts:74         a null pct is exactly what this test is about
features/rates/tests/resolveRate.test.ts:86         a numeric-as-string pct is exactly what this test is about
```

Two of those deserve a second look on their own. `check-pickup-date` pins the
bug where the frontend's ISO string reached `getHours` — **and the signature
already forbade it**, so `tsc` would have caught that bug the day it was
written if the test had been TypeScript. And `resolveRate` pins that
`scrap_pct` arrives as a *string* from pg, in a file whose own comment says so
— while `Rate` declares it `number`. The coercion the test protects exists
precisely because the type is not true.

### L-B7 — small things the compiler proved

- **Dead defensive code**: `sales-dual-write` did `created?.id ?? created`
  twice. `insertSalesOrder` returns a plain string, so the `.id` half had never
  once run.
- **A guard that conflated two failures**: `quotes/tests/replay` asserted
  `gold?.ask > 0 && gold?.bid > 0` under one message. `undefined > 0` is false,
  so "dev has no Gold row" and "Gold is priced zero" reported identically.
  Split.
- **`new Date(null)` is the epoch, not an error**: `fulfillments/tests/service`
  compared `new Date(booked.pickup.start_time)` against a requested time with
  `start_time` nullable. Unguarded, an unscheduled pickup compared 1970 to the
  request and failed with two dates instead of naming the null.
- **Dynamic verb dispatch**: `request(app)[verb](path)` over an inferred array
  indexes `SuperTest` with a union of body shapes. Three files; the tuple type
  is the fix.

### L-B8 — a vacuous test on `default_shipping`, found by the compiler in one line *(the best find of the pass)*

`features/places/addresses/tests/service.test.js`, *"setting a default clears
the others, in both schemas"*.

`draft()` returns a **wrapper** — `{ address, user_address }` — and ten of the
file's thirteen `service.create` call sites **spread** it:
`{ ...draft(), userId }`. Three wrapped it a second time:

```js
service.create({ address: draft(), userId: owner }, c)   // wrong
service.create({ ...draft(),       userId: owner }, c)   // right
```

So the service received an `address` containing no address columns at all, and
no `user_address` — which means `default_shipping` fell to its `=== true`
default of **false**. The `true` this test needed was passed in `draft()`'s
**first** argument, which is the *address* overrides, so it landed as a stray
key on the address object and never reached the service either. Two independent
mistakes in one call, and they compound.

**The consequence**: `first` was never the default. So *"setting a default
clears the others"* cleared nothing, and the closing assertion —

```js
assert.ok(nx.some((r) => r.address_id === first.id && r.default_shipping === false),
  "the address that used to be the default is still one");
```

— was true because it **never was one**. A green test on the address
default-shipping path, asserting nothing.

TypeScript named it on the first compile: *`AddressInput` has no properties in
common with `{ address: …, user_address: … }`*. Not "possibly undefined", not a
nullability nag — **no properties in common**, which is the compiler saying the
two shapes are unrelated.

Corrected to the spread form the other ten sites use. **The test now passes for
real**: 13 tests, 13 pass, 0 fail. The product behaviour was right all along —
only the test was not testing it.

This is the concrete answer to ruling 33's "expect the conversion to surface
real defects". A grep for `default_shipping` finds this test and reports
coverage. Only the type checker could see that the coverage was imaginary.

### L-B9 — `amount_capturable` and `amount_received` have no destination in `payments.*`, and the type says so

Surfaced by converting `features/payments/webhook-updates.test.js`. Four
fixtures build a Stripe intent with `amount_capturable: 0`, and tsc refuses it:

> `Object literal may only specify known properties, and 'amount_capturable'
> does not exist in type 'StripeIntentLike'`

`StripeIntentLike` (`features/payments/repo.next.ts:53`) declares exactly four
fields: `id`, `status`, `amount`, `amount_received`. Following it out:

- **`repo.exchange.js` writes `amount_capturable`** — `SET amount_capturable = $4`
  from `payment_intent.amount_capturable`, and projects it on read.
- **`repo.next.ts`'s `updatePaymentIntent` writes `status` and
  `amount_expected` and nothing else.** Not `amount_received`, which its own
  type declares.
- **`payments.*` has no column for either.** Verified read-only against dev —
  every `amount*` column in the schema is `attempts.amount`,
  `intents.amount_expected`, `ledger.amount`, `stripe_charges.amount` and
  `stripe_charges.amount_refunded`. No `amount_received`. No
  `amount_capturable`. No migration creates one.
- **The read side knows it.** `repo.next.ts`'s projection is literally
  `NULL::numeric AS amount_capturable`, and derives `amount_received` from
  `stripe_charges.settled_amount`. So the wire contract is satisfied and the
  value is a hardcoded null. Stated precisely because the difference matters:
  `amount_received` IS reconstructible from the charge; `amount_capturable`
  is not stored anywhere and is not reconstructible.

So **promoting `PAYMENTS_SOURCE` stops recording both fields**. `exchange` has
18 of 21 rows carrying an `amount_capturable` (all zero in dev, which is why
nothing has noticed) and `amount_received` is the field CLAUDE.md's open thread
is about — *"records `amount_received` as null or 0 while still saying
`requires_payment_method`"*, on the webhook whose failure has $126.48 of real
money unaccounted for.

**This is not a defect I introduced or can fix** — it is a schema and repo gap
in `api/features/payments/**` plus a migration. Flagged for Jacob because it is
on the money path and because the promotion decision is his. Worth pointing
`audit:coverage` at `exchange.payment_intents` specifically to confirm whether
it already reports these two and was read past.

### L-B10 — the payments parity test compared `undefined` to `undefined`, and `NaN` to `NaN`

`features/payments/repo.next.test.js`, *"both implementations find the same
Stripe intent"* — the test whose whole job is to be the evidence that
`PAYMENTS_SOURCE` can move.

```js
assert.equal(b.payment_intent_id, a.payment_intent_id, "they resumed different intents");
assert.equal(Number(b.amount),    Number(a.amount),    "they disagree about the amount");
```

**Neither implementation returns either field.** Both projections were
converted to the wire shape: the intent id is `attempt.provider_ref` and the
money is `amount_expected`. `repo.exchange.js` builds
`jsonb_build_object('provider_ref', payment_intent_id) AS attempt`;
`repo.next.ts` does the same off `payments.attempts`. `.payment_intent_id` and
`.amount` are `undefined` on **both** sides.

So the first assertion compared `undefined` to `undefined`. And the second is
worse than it looks: `Number(undefined)` is `NaN`, and `assert.equal` under
`node:assert/strict` is `Object.is` — which makes **`NaN === NaN` pass**. Two
green assertions, neither comparing anything, on the parity test for the
feature holding fourteen sets of unencrypted bank details.

Rewritten against the fields that exist, with a floor so an absent
`provider_ref` fails rather than passing quietly:

```ts
assert.ok(a && b, "one implementation found an intent and the other did not");
assert.ok(a.attempt?.provider_ref, "the exchange read carries no provider_ref to compare");
assert.equal(b.attempt?.provider_ref, a.attempt?.provider_ref, "they resumed different intents");
assert.equal(Number(b.amount_expected), Number(a.amount_expected), "they disagree about the amount");
```

Found by one line of tsc output: *"Property 'payment_intent_id' does not exist
on type 'PaymentIntentRow'"*. **This is the second vacuous test the conversion
has found** (L-B8 is the first), and the second is on the money.

### L-B11 — the relocation broke two tests' paths, exactly as ruling 31 warned

Ruling 31 says the move is *"mechanical, but NOT a blind `git mv`"*. Two files
proved it:

- `features/authorization/tests/role-ladder.ts` computed
  `API = path.resolve(HERE, "../..")`. From `features/authorization/` that was
  `api/`; from `features/authorization/tests/` it is `features/`. The
  middleware read would have ENOENT'd and the route walk would have found
  nothing.
- `features/shipping/operations/tests/resolver.ts` reads `handler.ts` with
  `path.join(import.meta.dirname, name)` — **beside** the test, which the test
  no longer is.

Both fixed and re-run: **14 tests, 14 pass**. Worth noting *how* they would
have failed, because it is D135 again: both carry floors (`routeFiles.length >= 20`;
an explicit throw naming the missing handler), so both would have failed
**loudly**. A report would have printed a smaller number and exited 0.

### L-B12 — a test read `.type` off a spot wire that renamed it to `.name`

`features/sales-tax/tests/server-spots.ts` built its request body with
`metal_type: serverSpots[0].type`. The spots wire converted in D70 and the
field is `name`; `SpotWire` has no `type`. So the body was sending
`metal_type: undefined` to the tax endpoint.

The surviving assertion is only `Number.isFinite(tax)`, which holds either way
— so this was not a false green so much as a test quietly not exercising what
it names. Corrected to `.name`; re-run, **3 tests, 3 pass**.

## What is left, and why

**28 files stay JavaScript.** None of them is a feature test:

| what | why |
|---|---|
| `shared/http/query.test.js`, `shared/db/transaction-side-effects.test.js` and friends | CLAUDE.md's standing constraint keeps `query.js`, `withTransaction.js` and `asyncHandler.js` as JavaScript; their tests reasonably follow (ruling 33 says so itself) |
| `scripts/lib/*.test.js` | `api/tsconfig.json` **excludes `scripts` entirely**, so converting them buys no type coverage at all — and `scripts/**` is another lane's |
| `shared/**`, `providers/**`, `db.test.js` | converts cleanly, just not reached. ~18 files, no known blockers |
| `features/auth/config-options.test.js`, `features/authorization/admin-routes.test.js` | the only two feature tests left, and both resist the ruling-31 *move* rather than the conversion. `config-options` reads `./client.ts` beside itself; `admin-routes` reads `./admin-routes.json` beside itself **and** resolves source files through `../../${rel}` twice. Moving either into `tests/` changes four path bases, so this wants a deliberate pass, not a batch — L-B11 is what happens when it is not done carefully |

## For the lanes that own source

Every one of these is a one-line change in a file that is **not mine**, and
each unblocks something. None is urgent; all are recorded because the type
checker found them and nothing else would have.

| file | change | why |
|---|---|---|
| `features/orders/intake.ts` | `block: Block \| null \| undefined` | the guard on its first line handles a value the type forbids |
| `features/sales-tax/service.ts` | `state: string \| null \| undefined` | the defect this project pinned passed `undefined`, which the type refuses |
| `features/orders/service.ts` | narrow `updateScrapItem`'s `item` to what it reads | requires `metal` and `content`, reads neither |
| `features/orders/compose.ts` / `features/pricing/bid.ts` | give `payout` its `cost`, or make `calculateTotalPrice` refuse a payout it cannot read | today an absent payout yields a **`NaN` total**, silently |
| `features/orders/read.service.ts` | return the composed type rather than `Record<string, unknown>[]` | five test files had to re-declare the order shape because the service discards it |
| `features/payments/repo.next.ts` + a migration | `amount_capturable` / `amount_received` | see L-B9 — money path |
| `shared/testing/pinned-pool.d.ts`, `session.d.ts` | **delete** | dead files that disagree with the `.ts` beside them (L-B0) |

## What was added to `api/types/supertest.d.ts`

Kept narrow, per the file's own rule — only what a test actually reads:

- `Response.request: { method, url }` — a loop over several calls names which one failed.
- `Response.headers` — the PDF tests assert `content-type` and `content-disposition`.
- `Test.buffer()` / `Test.parse()` — a PDF route returns bytes and superagent's default parser would decode them as text.

`patch` was already there (wave 5A, D136).

## The rename could have blinded the gate. It did not — checked, not assumed.

Renaming 89 files from `.test.js` to `.test.ts` is exactly the shape of D120
and D135: a script that walks `**/*.test.js` would go on exiting 0 while
auditing an ever-smaller suite. Every gate member that touches test files was
checked by hand:

| script | how it finds tests | verdict |
|---|---|---|
| `audit:vacuous-tests` | `/\.test\.(js\|ts)$/` | sees both, **and has a file floor** |
| `lint:row-vs-list` | excludes `/\.test\.(js\|ts)$/` | excludes both, so nothing leaked in |
| `audit:slow-tests`, `audit:test-leaks` | spawn `node --test` | discovery is node's, which knows both |
| `audit:switches`, `audit:table-owners` | exclude on `.includes(".test.")` | extension-agnostic |

`audit:vacuous-tests` run after the conversion reports **24 LOOP / 8 SKIP**
against 110 `.test.ts` + 28 `.test.js`, and every finding is pre-existing code
— none is in an assertion this pass wrote. (CLAUDE.md's "13 LOOP / 9 SKIP" is
an older figure; the script is unmodified on this branch, so the delta is the
suite having grown, not the detector having changed.)

`scripts/waves.mjs` parses this file's six bars with no warning.

## Verification

| gate | result |
|---|---|
| `pnpm --filter @dorado/api typecheck` | **clean**, re-run after the last concurrent source edit |
| `pnpm --filter @dorado/api test` | **942 tests, 942 pass, 0 fail**, exit 0, 463 s |
| `pnpm --filter @dorado/frontend test` | 23 files, 163 tests, all pass (untouched, confirmed) |
| `audit:vacuous-tests` | 24 LOOP / 8 SKIP, all pre-existing; the walk still sees every file |
| `scripts/waves.mjs` | parses all six bars, no warning |

Targeted runs during the pass, each green before moving on: `features/orders/tests`
**184/184**; the converted feature tests **337/337**; `places/addresses/tests/service`
**13/13** (after the L-B8 fix); the two relocated path-sensitive files **14/14**;
`sales-tax/tests/server-spots` **3/3**.

### THE SUITE COUNT MOVED: 934 → 942, +8, and none of them is mine

All eight are in `features/pricing/tests/bid.test.ts`, and they are **another
lane fixing L-B2 while this pass ran**:

```
a payout object with no cost is the fee-less case, not NaN
a payout cost that is not a number throws rather than defaulting
a null payout cost is no payout fee
a missing payout is no payout fee, and does not throw
a numeric string is still a fee
a shipping charge that is not a number throws rather than defaulting
a line total that cannot be computed stops the invoice
a return declared value that cannot be computed stops the label
```

`features/pricing/bid.ts` now reads `payout?: { cost?: number | null } | null`,
and its new comment says the old `payout: { cost: number }` was *"a LIE THE TYPE
told"* — which is L-B2 in three words. (The ninth new line,
`scripts/lib/self-test.mjs`, is the scripts lane's.)

**One partition note, not a complaint**: `features/pricing/tests/bid.test.ts` is
a test file, and test files are this lane's. Another lane edited it — correctly,
since a fix and its pin belong in one commit. Flagging it only so the
coordinator knows the boundary was crossed and the result is good.
