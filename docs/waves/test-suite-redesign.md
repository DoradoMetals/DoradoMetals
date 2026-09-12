# The API test suite: audit and redesign

Jacob, 2026-09-02: *"All of our API test stuff could probably use a pretty big lift...
I'll give you liberty to work through that and design/implement a better version. Pick
best libraries for the job... Main things with tests is that stripe/fedex need to be
using the sandboxes."* D214 item 9.

Measured 2026-09-03 at `c24f9e30` (CRUD batch 5); the tree moved during the audit
(`945c90c2` had 161 files / 988 tests), so numbers below are HEAD.

# 1. Audit

## 1.1 Inventory

**163 files, 998 tests, 21.1 s wall, 66.4 s summed.** Local Postgres 16 on loopback,
`node --test --test-concurrency=24`. **29% of the tests use 96% of the time.** 126 route
literals in `transport/`; supertest touches 89 `/api` paths.

| layer | files | tests | summed s | share of time |
|---|---|---|---|---|
| pure (no database, no HTTP) | 33 | 290 | 0.5 | 1% |
| static-source (reads its own source text) | 6 | 27 | 0.1 | 0% |
| repo (one table, transactional) | 34 | 122 | 2.3 | 3% |
| service (domain, transactional) | 42 | 280 | 25.2 | 38% |
| HTTP (supertest against the real app) | 48 | 279 | 38.3 | 58% |
| external (`sandbox/*.sandbox.js`) | 2 | ~12 | — | not in the suite |

Slowest 15 files by summed test time, all under 4 s — the local Postgres pivot did what
D198 said it would, and `audit:slow-tests` reports **no unaccepted outliers**:
orders/patch 3.93, place-sale 3.78, place 3.52, media/pdfs/service
3.32, media/pdfs/replay 3.21, send-to-refiner 3.21, media/emails/service 3.12,
refiner-edits 2.98, purchase-replay 2.82, paper-trail 2.76, sales-replay 2.74,
sales-patch 2.58, payouts/patch 2.53, update-tracking 1.96, place-purchase 1.94.

**Frozen-`exchange` oracle tests: ONE, not twenty.** The 20 files named
`replay.test.ts` are not oracles — the name is dual-era residue and they are ordinary
HTTP endpoint tests. The survivor is
`domain/shipping/operations/tests/resolver.test.ts`, checking `shipping.carriers` still
agrees with the frozen `exchange.carriers` reference rows: a reference-data check, not a
dual-write oracle, and cheap. **But 35 files still read FIXTURES out of frozen
`exchange` tables** — see 1.5.

**Vacuous tests (`audit:vacuous-tests`): 13 LOOP + 5 SKIP of 915 scanned.** Each LOOP
iterates a collection with nothing asserting it is non-empty (a one-line fix each); the
5 SKIPs return early when a fixture query finds nothing.

## 1.2 The harness — and it is good

Keep it. `pinned-pool.ts` pins one client in a rolled-back transaction and rewrites
`withTransaction`'s BEGIN/COMMIT to SAVEPOINTs, so a service opens its own transaction
exactly as in production and leaves nothing behind; `outside()` reads committed data on
a separate connection and `assertNothingEscaped` proves the pin from outside. It works
only because `lint:db` forces every query through one executor. `session.ts` replaces
`auth.api.getSession`, not the middleware, so `requireAuth`, the role ladder and every
401/403 stay real. `locks.ts` holds five advisory lock ids; `preflight-test-db.ts`
refuses a stopped or wrong database; `audit:test-leaks` content-hashes every `exchange`
table around a run, because `tracking.test.js` once deleted the real FedEx history of
five dev shipments. **The transactional-rollback design against a real local Postgres is
a strength; nothing below replaces it.**

**What is wrong with it:**
1. **The lock discipline is manual, unenforced, and it just broke.** Of 269
   `inPinnedTransaction` calls in 59 files, **190 pass no options at all**, and
   the suite failed **997/998** on the second audit run:
   `domain/orders/tests/refiner-edits.test.ts` — "the mirror invariant" — raised
   **`deadlock detected`**. That file passes `{ lock: ORDER_LOCK }` on 7 of its
   10 pinned calls and omits it on 3; `place-purchase.test.ts` places purchase
   orders in 8 pinned calls and takes **no lock at any of them**. `locks.ts`
   states the failure mode itself: a missing lock is latent until timing changes
   elsewhere, and timing changed when CRUD batch 5 landed.
2. **The actor is set by exactly ONE file of 163.** Migration 116 moved
   `created_by`/`updated_by`/`created_at`/`updated_at` onto a trigger reading
   `app.actor_id`, and `inPinnedTransaction` takes an `actor` option — so 26
   tables' audit stamping is written as system-authored and is unverified.
3. **`inRollback` is hand-written 48 times** — the same BEGIN/ROLLBACK helper in
   48 files. `aUser` exists 7 times with 7 different queries.
4. **The runner spawns 163 processes.** Every supertest file imports `#app`,
   pulling the whole graph, and each process opens its own pg Pool. That is where
   the wall clock goes — see 2.1.

## 1.3 Providers — the hard finding

| provider | how a test avoids it today | is it a guard? |
|---|---|---|
| **FedEx** | `refuseInTests()` throws on every outbound call unless `FEDEX_ENV=sandbox`; it covers `fetchAccessToken`, `fetchTrackingToken`, `fedexPost`, `fedexPut` — the whole surface | **Yes**, armed: `FEDEX_ENV` is unset, so it defaults to production and refuses |
| **email** | `sendEmail(msg, transport?)` — a DI seam, and the real transport refuses to build in a test run | **Yes** |
| **Stripe** | `stripe-client.ts` refuses only an `sk_live` key | **NO** |

**`STRIPE_SECRET_KEY` in the suite's environment is `sk_test_…`, so the refusal
never fires.** Any test reaching `stripe.createIntent` would make a real network call to
Stripe test mode — non-deterministic, network-dependent, and minting the abandoned
`requires_payment_method` intents `audit:payments` already complains about. The only
protection is that no test drives those paths: a convention in three file headers, and
headers are not guards. Stripe has **no DI seam either** — `domain/payments/service.ts`,
`domain/orders/place.ts` and `transport/payments/controller.ts` all `import * as stripe`
directly.

So **every Stripe success path is untested** — three of the five payments routes end at
Stripe, and `payments/replay.test.ts` says in its header that it asserts refusals only.
For FedEx the guard throws rather than stubs, so every label-buying and pickup-booking
path is untestable in the default lane; `seed-e2e-order.mjs` exists because `placeOrder`
always buys a label. Only `getTracking` has a seam.

**No HTTP mocking library exists anywhere in the monorepo** — no `nock`, `msw`,
`polly` or `stripe-mock`. All outbound calls are axios (FedEx, Turnstile) or the Stripe
SDK; Stripe 18.5 defaults to `createNodeHttpClient`, node's `https` module, and nothing
in `api/` uses `fetch`, so one `http`/`https` interceptor covers
**100% of outbound traffic**.

Sandbox credentials present and working: `FEDEX_SANDBOX_{CLIENT_ID,CLIENT_SECRET,
ACCOUNT_NUMBER,API_URL}`, `FEDEX_TRACKING_SANDBOX_ACCOUNT_NUMBER`, `STRIPE_SECRET_KEY`
(sk_test), `STRIPE_WEBHOOK_SECRET`. `sandbox/fedex.sandbox.js` proves the credentials
authenticate and that shipping and tracking get different tokens, and buys no label;
`sandbox/stripe.sandbox.js` creates and cancels its own objects. Both run only under
`pnpm test:sandbox`.

## 1.4 Coverage by use case

| use case | HTTP | service | notes |
|---|---|---|---|
| place purchase order | yes | yes | never through `createLabel`; the FedEx call is unreachable |
| place sales order | yes | yes | the open-intent branch (`updateIntent`) is uncovered |
| charge / intent lifecycle | refusals only | partial | webhook and guards covered; **no success path** |
| webhook signature verification | no | no | `verifyWebhook` is never exercised, in any lane |
| payout | yes | yes | `payouts/patch`, `quotes/payout-quote`, `details/encryption` |
| refine / send to refiner | yes | yes | `send-to-refiner`, `refiner-edits` |
| cancel | partial | yes | the FedEx `cancelLabel` half is unreachable |
| tracking | no | yes | via the `fetchTracking` seam — the one good provider seam |
| checkout sync | yes | yes | `carts-http`, `checkout-row`, `checkout/replay` |
| pickup schedule / cancel | yes | yes | FedEx `createPickup` unreachable |
| rate quote | no | no | `getRates` has no test at all |
| address validation | no | no | `validateAddress` has no test at all |

**Repo tests: 31 of 45 tables.** Missing: `metals`, `reviews`, `transactions`,
`payouts`, `refiners`, `rates`, `sales-tax`, `mints`, `spots`, `leads`,
`places/user-addresses`, `shipping/{packages,tracking}` and `media/images`.

## 1.5 Fixtures

**There is no fixture library.** `shared/testing/` holds the pin, the session,
the locks and the test-run flag — nothing that builds data.

- **207 `SELECT … LIMIT 1` fixture discoveries across 86 of 163 files** — the
  dominant strategy is "find whatever row the database happens to hold" — with
  **149 guard or early-return lines** protecting them. That is the direct cause
  of every `audit:vacuous-tests` SKIP and of the seven silently passing tests
  that audit was written for.
- **Only 38 inline `INSERT`s in the whole suite**; building your own data is the
  exception. **35 files take fixtures from FROZEN `exchange` tables**, so the
  suite's inputs are a snapshot `provision:test` rebuilds from dev.
- Duplication: `inRollback` × 48, `aUser` × 7, `anOrder` × 3, plus `seedSale`,
  `seedIntent`, `anIntent`, `aDraftFulfillment`, `twoPeople`, `actingAs`.

A builder library removes all of it. It is the highest-value change here.

# 2. Design

## 2.1 Runner — vitest 4

Measured, same 140 portable files, same machine, same local Postgres:

| runner | run 1 | run 2 |
|---|---|---|
| `node --test --test-concurrency=24` | 19.41 s | 18.96 s |
| `vitest 4.1.11`, forks pool, defaults | 10.03 s | 10.01 s |

**Vitest is 1.9× faster and run-to-run stable.** The reason is the process model:
`node --test` starts one process per file and each re-imports the whole `#app` graph,
while vitest reuses ~24 forked workers with a cached module graph.

Method, so the number can be checked: 163 files copied to a scratchpad, `node:test`
imports rewritten to `vitest` (`before`→`beforeAll`, `after`→`afterAll`), subpath
imports resolved by `resolve.alias`, `assert` untouched. 23 files did not run — the
prototype flattens directory paths and they read their own source or spawn a child, an
artifact and not a portability finding — so they are excluded from **both** runners
above.

Conversion cost is small and measured: the suite uses only `test`, `before`, `after`,
`describe` (3 files) and `afterEach` (1 file), with **zero uses of `mock.*` or
`t.mock`**, and all 2947 `assert.*` calls stay — vitest runs `node:assert/strict`
unchanged. The port is one import line per file, plus two renames.

Beyond speed: one runner across the monorepo (frontend and components already run vitest
4), `--changed`/`--related` selection, watch mode, `@vitest/coverage-v8` (installed),
`vi.mock` for the Stripe seam, and `retry` with flake reporting.

**Recommendation:** move the API suite to vitest 4, keeping the pinned-pool,
session and lock harness exactly as it is.
**Rejected:** staying on `node --test` — zero dependencies is real, but it costs
9 s a run, has no module mocking, coverage or changed-file selection, and its per-file
process model is the cost itself.

## 2.2 Layers and their tools

| layer | script | database | what moves here |
|---|---|---|---|
| **L1 rules** | `test:unit` | none | `domain/*/rules.ts`, `pricing/*`, `shipments/utils/*`, `operations/adapters/fedex.ts`, `convertWeights` — the 33 pure files plus every rule extracted from a service test |
| **L2 architecture guards** | `lint:architecture` | none | the 6 static-source files (`http/endpoints`, `frontend-routes`, `browser-triggered-effects`, `transaction-side-effects`, `role-ladder`, `auth/config-options`) — lints in a test's clothes, and the files that resist any runner move |
| **L3 repo** | `test:db` | pinned txn | one file per table, five verbs; **add the 14 missing tables** |
| **L4 use case** | `test:db` | pinned txn + lock + **actor** | place, charge, payout, refine, cancel, tracking, checkout sync |
| **L5 HTTP contract** | `test:http` | pinned txn | supertest against the real app, response parsed through `@dorado/contracts` with `.strict()` |
| **L6 external** | `test:external` | none | Stripe test mode, FedEx sandbox |

L5 is the biggest change in kind. **Zero of the 279 HTTP tests parse a response through
a contract today** — 158 assertions are on a status code and a hand-picked key, and
`validate:wire` does the parsing as a separate script against dev, outside the suite.
Moving that assertion into the test makes the contract the test, and catches what
`validate:wire` was extended for: a projection that grew a column and reached the wire
unnoticed.

**Recommendation:** five lanes as above; every HTTP test ends with
`Contract.strict().parse(res.body)`.
**Rejected:** one undifferentiated `test` script — it makes 96% of the time
invisible and lets a rule needing no database cost a transaction.

## 2.3 Fixtures — typed builders, hand-rolled

`api/shared/testing/fixtures/` — one module per aggregate, each **inserting through the
repos**, never by raw SQL, so migration 116's trigger stamps the row and the repo's own
guards apply:

```ts
const { user, address } = await aCustomer(c);
const order = await anOrder(c, { direction: "purchase", user })
  .withLots(2, { metal: "Gold", purity: 0.9999 }).withPayout({ method: "ACH" });
```

Rules: the pinned client is always the first argument; every default is a literal in the
builder, never a database lookup; ids are deterministic per file (a counter plus the
file name), so a failure reproduces. `@faker-js/faker` supplies *content only* — names,
street lines, emails — never identity, amounts or purities, which must be readable in a
failure message.

**Recommendation:** hand-rolled builders in `shared/testing/fixtures/`, faker for
content, one exported `inPinned` helper imported rather than rewritten 48 times.
**Rejected:** `fishery` — a factory DSL for plain objects, when the whole point
is that a fixture must go through the repo and the trigger.

## 2.4 External providers — the hard requirement

**(a) The sandbox lane.** `pnpm --filter @dorado/api test:external` runs
`sandbox/*.sandbox.ts` deliberately and nightly, **never** in `check:fast` or `check`,
with Stripe test mode and `FEDEX_ENV=sandbox`. Extend the two files to cover what replay
cannot: real OAuth (already there); a real **rate quote** and
**address validation** — read-only, and the two FedEx calls with no test today;
an intent created, confirmed with `pm_card_visa`, captured and cancelled; and
**real webhook signature verification** — sign a payload with
`STRIPE_WEBHOOK_SECRET` and drive `verifyWebhook`, which only this lane can.

It must never buy a FedEx label it does not void in the same run's `after` hook, book a
pickup it does not cancel, leave a Stripe intent neither `succeeded` nor `canceled`, or
run with an `sk_live` key. FedEx sandbox limits: the OAuth token lasts about an hour and
must be fetched once per run; the API is rate limited per second, so no parallel
fan-out; and `cancelLabel` voids a sandbox label, which is not optional.

**(b) The default lane replays recorded responses — `nock`, with `nock.back`.**
Cassettes in `api/tests/cassettes/<provider>/<name>.json`, refreshed by
`NOCK_BACK_MODE=update pnpm --filter @dorado/api test:record` against the same
sandboxes. Why nock and not the others:

- **`msw` + `@mswjs/data`** — its strength is one handler set shared by browser
  and node. `api/` has no browser and **no `fetch` at all**, so its interceptor is
  the heavier way to reach the same `https` module, and `@mswjs/data` is an
  in-memory database this project already has a real one for.
- **`stripe-mock`** — validates against Stripe's OpenAPI spec but returns
  *generated* data, so it cannot pin an amount, an intent id or
  `automatic_payment_methods` behaviour: it proves the call is well-formed and
  nothing about our money. Also a separate Docker service, unverified here.
- **`polly.js`** — adapters plus persisters, a larger surface for the same job.

nock also gives the guard that matters most — in `tests/setup/no-network.ts`, loaded by
every lane except `test:external`: `nock.disableNetConnect()` then
`nock.enableNetConnect(/^(127\.0\.0\.1|::1|localhost)/)` for Postgres. **That converts
"no test drives Stripe" from a convention into a guard**, the most important item here
after the fixtures: today a `sk_test` key plus one careless `await` reaches the
internet.

**(c) The live-key refusals stay**, unchanged and un-bypassable, with
`disableNetConnect` underneath: FedEx refuses by env, Stripe by key prefix, nock by
socket.

**(d) Idempotency keys and test clocks.** `createIntent` takes an
`idempotencyKey`; a cassette must key on it as well as path and body, or a replayed
retry returns the first call's intent and the assertion passes for the wrong reason. In
the sandbox lane the key must include the run id. **Stripe test clocks belong to the
sandbox lane only** — a server-side object has no meaning in a replayed response.

**(e) What each lane proves.** Replay proves our mapping, error handling,
idempotency keys and row writes — that a known provider response produces the right
database state — and nothing about the provider. The sandbox lane proves the credentials
work, the request shape is accepted, the response shape has not drifted, a signature
verifies, and an SDK major did not change the wire, so it must run before the deferred
Stripe 18→22 upgrade lands.

**Recommendation:** nock with `nock.back` in the default lane, cassettes in the
repo, plus `nock.disableNetConnect()` in every lane but `test:external`.
**Rejected:** `msw` — it buys browser/node handler sharing this API cannot use,
over a codebase with zero `fetch` calls.

## 2.5 Coverage measurement

`@vitest/coverage-v8` (present at 4.1.11). Per-layer thresholds, not one global number,
because a global number lets `db/` carry `domain/`: `db/**` 90 lines / 75 branches,
`domain/**` 80/70, `transport/**` 85/70, `shared/**` 80/70, `providers/**` excluded
since `test:external` measures it. Set each on the first run at the measured number
minus two, so it ratchets rather than blocking.

**Recommendation:** v8 coverage, per-path thresholds, ratcheted from the first
measurement. **Rejected:** a global percentage — it hides the imbalance 1.1 measured.

## 2.6 Gate placement

`check:fast` measured today: **21.97 s**, `api:test` at 20.17 s the critical path.
(`api:lint:script-guards` at 17.69 s is the other surprise; it wants its own look.)

| lane | contents | budget |
|---|---|---|
| `check:fast` | contracts build, api lints, typecheck, `test:unit` + `test:db` + `test:http` (cassettes, no network) | **≤ 25 s**; ~12 s expected after 2.1 |
| `check` | the above plus components, frontend, dev-database audits, and `audit:vacuous-tests` + `audit:test-leaks` promoted in | unchanged, ~230 s |
| nightly | `test:external`, `e2e`, `audit:slow-tests`, `audit:plaintext-secrets` | none |

`audit:vacuous-tests` is in neither gate today; fix its 18 findings in lane 1 and it can
gate. **Recommendation:** as tabled; `test:external` never gates a commit.
**Rejected:** running the sandboxes in `check` — a FedEx bad morning would paint
the gate red for a fact about somebody else's service, the reasoning that already keeps
`audit:payments` out.

# 3. Migration path

Each lane is independently mergeable and gated on `pnpm check`.

**Lane 0 — stop the bleeding** *(blocking, small, first)*. Pass
`{ lock: LOCKS.ORDERS }` at the 3 unlocked calls in `refiner-edits.test.ts` and the 8 in
`place-purchase.test.ts`, and sweep the other 190 optionless calls. Add
`lint:test-locks` — a static check that a test importing a repo for a locked table
passes that lock at every pinned call. *Accept:* three consecutive runs at 998/998;
`lint:test-locks --self-test` passes.

**Lane 1 — fixtures** *(highest value; before the runner move)*. Build
`shared/testing/fixtures/`; export one `inPinned` helper and delete the 48 hand-written
`inRollback`s; convert the 207 `LIMIT 1` discoveries to builders feature by feature,
deleting the 149 guard lines as their reason disappears; fix the 13 LOOP and 5 SKIP
findings. *Accept:* `audit:vacuous-tests` reports zero and joins `check`; no test uses
`LIMIT 1` as a fixture; `FROM exchange.` falls from 35 files to `users` only.

**Lane 2 — the actor.** Pass `actor:` at every pinned call writing an audited
table, and assert `created_by`/`updated_by` in the repo tests for the 26 tables
migration 116 stamps. *Accept:* a repo test per audited table asserts the stamp.

**Lane 3 — the runner.** Add vitest 4 + `@vitest/coverage-v8` to `@dorado/api`;
rewrite 163 import lines and the `before`/`after` names, keeping `assert`; split `test`
into `test:unit`, `test:db`, `test:http`; move the 6 static-source files to
`lint:architecture`. *Accept:* 998/998 under vitest; `check:fast` under 25 s with the
number in the commit message; `node --test` removed in the same commit.

**Lane 4 — no network.** Add `nock` and `tests/setup/no-network.ts` with
`disableNetConnect` in every lane but `test:external`. *Accept:* the suite is green with
the internet unreachable, and a scratch test calling `stripe.createIntent` fails with
nock's refusal rather than a timeout.

**Lane 5 — replay.** Record cassettes for Stripe (create, confirm, capture,
cancel, retrieve, webhook construct) and FedEx (token, rates, address validate, create
label, cancel label, pickup, tracking), then write the tests that were impossible: the
Stripe success paths, the `updateIntent` open-intent branch, and `placeOrder` through a
real `createLabel` mapping. *Accept:* the 12 use cases in 1.4 each have a passing
test, and `test:record` regenerates every cassette with the suite still green.

**Lane 6 — the sandbox lane.** Convert `sandbox/*.sandbox.js` to TypeScript; add
rate quote, address validation, webhook signature verification and the confirm/capture
cycle; add the void and cancel `after` hooks; wire to a nightly. *Accept:* it passes
twice in a row leaving no live object behind, verified by listing intents and
shipments after the run.

**Lane 7 — contracts and coverage.** Parse every HTTP response through its
contract with `.strict()`; add the 14 missing repo tests; turn coverage on.
*Accept:* thresholds in `vitest.config.ts`, first measurement in the message.

**What gets deleted, and when.** Nothing in lanes 0–2; in lane 3 the 6
static-source files **move** to lints rather than die; in lane 1 the 149 guard lines go
as their discoveries are replaced. **No test is deleted for being a frozen-`exchange`
oracle: there is only one and it is a legitimate reference-data check.** The assumption
that twenty `replay.test.ts` files were dead oracles is wrong — they are the HTTP layer.

# 4. Open questions for Jacob

1. **Do the cassettes go in git?** For: deterministic, reviewable, offline, and a
   provider shape change shows up as a diff. Against: a recorded response can carry
   a name, an address or a last-4, and this repo's first rule is customer data. *My
   inclination: commit them, with a redaction pass and a `lint:cassette-secrets`
   guard modelled on `audit:plaintext-secrets`.*
2. **Should the sandbox lane buy and void one real FedEx label?**
   `sandbox/fedex.sandbox.js` deliberately does not, for a good reason: an orphaned
   label for an order that does not exist. But `createLabel` is on the purchase
   path, it is why `seed-e2e-order.mjs` exists, and nothing has proved the payload
   FedEx accepts. One label bought and voided in the same `after` hook is the only
   way to know.
3. **`audit:slow-tests` in `check`, or not?** Its header says it stays out while D94
   is outstanding; D94 is closed and it reports no unaccepted outliers. Turning it
   on holds the line; leaving it off keeps the gate short.
