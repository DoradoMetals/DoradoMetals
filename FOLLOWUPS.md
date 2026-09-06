# Follow-ups

What is still open. Nothing finished belongs here.

- The standing rulings are `docs/rulings.md`.
- The full record up to 2026-09-07 — every decision, defect and wave, 16,356
  lines — is `docs/history/FOLLOWUPS-2026-09-07.md`.
- The production-day runbook is `docs/waves/production-chain.md`.

## 1. Review findings still open

The API review of 2026-09-07 raised 63 findings. Four fix lanes are merged and
`docs/reviews/README.md` is the ledger. These are what it left.

- **Finding 12, the label-buy gap.** If `record()`'s transaction fails after
  FedEx has sold the label, only the log knows the label number. It needs a
  catch-compensate-rethrow in the cancel and place use cases.
  (`docs/reviews/fixes-logistics-and-documents.md`)
- **Finding 17, no multi-instance lock.** The writing sweeps take no advisory
  lock across instances. Left on purpose: the guarded advance is safe to run
  twice, so a lock is out of proportion. Revisit if the API ever runs more than
  one instance.
- **Finding 23, the webhook race.** Two webhook deliveries arriving at once can
  both read "no confirmation sent yet" and both send.
- **`orders/place.ts`'s bare `await world.buyLabel(...)`.** After the commit it
  still throws out of `place()` on a carrier outage: the order is committed, the
  basket is not cleared and no confirmation goes out.

## 2. Production day

Rehearsed end to end on a production-shaped copy with zero aborts. Nothing has
touched real production. Every step is Jacob's, in the order
`docs/waves/production-chain.md` gives.

Two blockers before step 1:

- **The dump credential.** `PROD_READONLY_DATABASE_URL` cannot produce a full
  dump — no `USAGE` on `core` and `auctions`, no `SELECT` on four sequences.
  Dump as an owner role, or grant first.
- **Migration 086 is irreversible.** It drops five populated
  `exchange.purchase_orders` columns under its `allow-destructive:` marker.
  After it runs, the dump is the only copy of those columns.

Then, in order: `pg_dump -Fc` with the PostgreSQL 16 client (not the 14 on
PATH); restore to a scratch database and `compare:databases` against the
read-only source; `migrate:reset-january --commit`; one `migrate` run;
`verify:genesis`, `verify:backfill`, `audit:coverage`, `audit:precision`,
`audit:plaintext-secrets` and the full API suite against the restored copy;
`encrypt:payouts --commit` then `--verify`; `compare:databases` against the
pristine restore to prove the covenant; then the same sequence against
production itself, then merge.

Two loose ends the rehearsal named:

- **`migrate --reconcile` is owed on dev** for the migrations the rebuild lanes
  edited for a from-nothing build. `migrate` warns on each until it runs.
- **Dev's `exchange.purchase_orders` has two hand-added columns**,
  `pool_remediation` and `pool_oz_deducted`. No migration file creates them, so
  production does not have them.

**The plaintext exposure**, last measured on untouched production 2026-09-03: 24
rows across two tables — 14 payouts in `exchange.payouts` (7 ACH, 7 WIRE, 9
customers) and 10 January-residue rows in `payments.details` (8 customers).
Re-measure with `audit:plaintext-secrets --prod` before trusting that count on
the day.

## 3. Waiting on Jacob

- **Run the production sequence.** Everything in section 2.
- **Clean the two corrupt product rows.** Two production products carry
  `E'\n\tBar'` — a newline and a tab before "Bar" — as their type, and they are
  reachable on the bid storefront. The fix is an `UPDATE` against production.
- **Rename the Sentry token.** `NEXT_PUBLIC_SENTRY_AUTH_TOKEN` is a write
  credential wearing the "safe to expose" prefix. The order matters: rename in
  Railway first, then in code. Reversed, source-map upload breaks silently.
- **Stripe 22, by hand.** `docs/waves/stripe-22.md` section 8: dark
  PaymentElement, no radios, a 4242 checkout, decline-then-retry creating one
  order, the admin drawer billing the right customer, one live webhook.
- **A non-card admin sale method.** CREDIT is the only enabled non-card sale
  method in the seeds, so an admin-created sales order can be paid only from a
  customer's balance. Add a wire or ACH method, or leave it.
- **The `salesOrderCheckout` effect.** It creates the draft fulfillment on mount
  from a `useEffect`. Retiring it means the checkout GET creates the row — an
  API decision, not a frontend cleanup.
- **REST route questions**, five of them, in `docs/waves/rest-routes.md`:
  direction as a query parameter or in the body; admin list scoping by role on
  one path or a separate admin path; whether `checkout` and `cart` unify under
  one noun; the purchase/sale quote auth asymmetry; where `cancel_pickup` lives.
- **Test-suite questions**, three, in `docs/waves/test-suite-redesign.md`:
  commit the Stripe and FedEx cassettes to git or not; buy and void one real
  sandbox FedEx label in a test hook or not; put `audit:slow-tests` in
  `pnpm check` or leave it out.
- **`orders.transactions`: a table or a derivation?** Most of what it records
  may be derivable from payments plus the credit ledger. Deferred once; worth
  revisiting now that the credit reservation of ruling 88 has landed.
- **The orphan ledger row.** `exchange.schema_migrations` on dev holds a row
  named `134_a_balance_cannot_go_below_zero.sql` for a file that no longer
  exists. Inert. Delete only if he wants it gone.
- **`figma:inventory` has 12 standing findings** in `packages/components` and
  `scripts/figma`. It is the one gate member that has failed through every lane.
- **Docker images are unverified.** There is no Docker daemon in the dev
  environment, and both Dockerfiles were rewritten for the workspace and moved
  to Node 24 without ever running `docker build`.
- **The stale root `.env`**, if it is still on the machine, points at a database
  named `dorado_db` that no longer exists. Tooling must use `api/.env`.
  Deleting it is his call.

## 4. Environment keys

- **`PAYMENT_RECONCILE_SCHEDULE` is missing from `api/.env`.**
  `shared/cron/scheduler.ts` reads it, and without it the reconcile job — the
  settled-intents sweep and the abandoned-sale sweep — never runs at all. This
  is the one real gap.
- **`STALE_OFFERS_UPDATE_SCHEDULE`** is set and read by nothing. Safe to delete.
- **`COLLECTING_NEXUS_TAXES`** is set and read by nothing; ruling 87 removed the
  flag. Safe to delete.

`ANONYMOUS_SWEEP_SCHEDULE`, `GOOGLE_PLACES_API_KEY` and `TEST_DATABASE_URL` are
all present and correct.

## 5. The lots model

`docs/model/lots.md` is a complete written proposal for lots, link tables,
refining sales orders and the pool. There is no code, no migration and no lane.
It waits on Jacob, and ruling 86 adds that it waits on the frontend designs so
they can inform the API side.

Twelve questions, each with a recommendation already written into the doc:

1. Does a bullion lot get assayed? — no.
2. Can a lot be split after minting? — no split in place.
3. Is the pool per refiner per metal, or per refiner order? — per refiner per
   metal.
4. Do sales orders use lots? — yes.
5. Is a refiner payable created on every lot, or only on lots that need
   refining? — every lot.
6. Where does the frozen line price live? — `orders.lots.price`.
7. Does `refining.orders` carry a direction? — yes.
8. Is `content` a generated column or an expression? — generated.
9. What prices Dorado's and the refiner's ounces once `refiners.spots` is
   gone? — the most recent lock price for that refiner and metal, falling back
   to `spots.spots.bid`. **This is the one recommendation that moves a reported
   number** (`profit_breakdown`'s `dorado.spot_net`) and wants a before-and-after
   on a real order before it lands.
10. Is the refiner fee cash or pool? — cash, one column.
11. Does the checkout lot keep a premium column? — no; nothing would read it.
12. Not a question but a defect the write-up found: the bullion snapshot writes
    `post_melt = products.bullion.content` beside `purity`, and anything that
    derives content from the two would apply purity twice. Today's code stores
    `content` directly, so nothing is wrong now — the lots columns must not
    re-derive it.

## 6. Other queued work

- **Drop the `created_by` / `updated_by` TEXT columns** once the `audit_stamp`
  trigger reliably fills the `*_id` columns. Some readers still display the
  text.
- **Frontend chrome sits in `shared/`.** `Shell`, `Sidebar`, `Footer` and
  `ProfileMenu` are page chrome and belong in a `layout.tsx`.
- **Test-suite lanes 6 and 7 are unconfirmed.** Lane 6 converts the sandbox
  scripts to TypeScript and wires them to a nightly run; lane 7 parses every
  HTTP response through its contract with `.strict()` and adds the missing repo
  tests. No later note closes either.
- **Rulings 91 to 96 have no lane yet** — passwordless phone-first auth, the
  inbound SMS webhook, the softphone, Cloudflare, the Figma mailers, and the
  rule that no frontend component ships without an approved design.
  `docs/rulings.md` carries the text.

## D218 - the mailers are the Figma design, and the PDFs wear its system (ruling 95)

Jacob, 2026-09-07: *"add a lane for updating our pdfs/mailers too."* Thirteen
mailers rebuilt from the Media page: one 600px table-based base layout, the five
symbols as partials, one template per mailer holding the design's copy, and every
dynamic value from ONE SQL read parsed by its own contract - a card row is a row
of the read, never a dictionary. Ten new triggers (payout, both shipment scans,
both pickups, both appointments, document sent), each firing AFTER its commit and
made once-per-order by the email trail rather than by a flag column. The
appointment reminder is a daily cron whose SQL excludes what the trail says was
sent, so a second run the same day sends nothing. Masking is the auth design's:
`j•••@domain`, `(•••) •••-0134`, applied where the rows are built so a caller
cannot forget. `sendSignInCode` / `sendAccountCreated` / `sendDetailsChanged` are
exported for the passwordless-auth lane and take contracts, not argument bags.
Migration **141** adds twelve `media.email_kind` labels (dev only); five dead raw
templates and `sendCreatedEmail` are gone. The PDFs took the same ramp, spacing,
row and card - **the gold `#debb59` is retired** - with not one class, cell or
number changed, so their content tests stand untouched. **THE PDFs STILL HAVE NO
FIGMA PAGE**: the paper palette is derived from the mailer tokens and the page
furniture is the renderer's judgement, and Poppins stays until a Geist woff2 pair
lands in `shared/assets/fonts`. **NONE OF THESE HAS BEEN SEEN IN A REAL CLIENT** -
the design's own note says a dark mailer can come back partly inverted from
Gmail's and Outlook's transforms, and no send has left the stub. Detail in
`docs/waves/mailers.md`.

## The last skipped test is closed (cassette lane)

- `fulfillment-rates.test.ts`'s purchase-checkout rates test had no cassette because its request shape genuinely differs from `fedex/rate-quote.json`: the recipient is the Farmers Branch hold location (ruling 89), not a plain address, and `declaredValue` is populated. Recorded as `fedex/fulfillment-purchase-rates.json` against the real FedEx sandbox (`test:record`'s mechanism, run directly since `test:record`'s script names only the two provider files); the sandbox itself was intermittently returning 401/500/503 on unrelated known-good requests too, so recording took 8 attempts - not a request-shape defect.
- Closing it exposed a real, pre-existing latent deadlock: `rates.rates` carries a GIST exclusion constraint on `(metal_id, unit, range)`, which `lint-test-locks`'s table map doesn't know about, and `pricing/rates/tests/repo.test.ts` + `service.test.ts` + `db/rates/tests/repo.test.ts` all insert overlapping `Gold`/`oz` ranges with no lock. Two overlapping inserts wait on each other instead of one raising 23505, and the extra runtime of the new test shifted vitest's scheduling enough to run two of them concurrently and deadlock (reproduced once in five full-suite runs). Added `LOCKS.RATES` and applied it to all three files' `inPinnedTransaction`/`inRollback` calls that call `rates.create`.
- `pnpm --filter @dorado/api test`: 1485 passed, 0 skipped, across 5 consecutive full runs after the lock fix. `pnpm check:fast` green except the pre-existing `figma:inventory`.

## Payment rails: Moov and Plaid behind interfaces (rails lane, ruling 97)

- **The Payment card's states are now ROWS.** `payments.transfers` (migration 150) carries one row per money movement with `kind` payout/charge and a `payments.transfer_state` whose labels are the card's own: `Not sent -> Processing -> Sent` for a payout, `Due -> Processing -> Received` for a charge, `Failed` with a `failure_reason` from anywhere. Ruling 74 is intact: this is the MOVEMENT, not a payouts table - the account is still `payments.details` or a Moov vault reference.
- **Idempotency is a unique index, not a convention.** `payments.transfer_events` is unique on `(provider, event_id)` and the insert is `ON CONFLICT DO NOTHING RETURNING *`, so no row back IS "already applied"; states are ranked and only move forward, so a late `pending` after a `completed` is recorded and applied to nothing. Both pinned by tests.
- **`payments.inbound_transactions` (151) holds every inbound movement** - Moov transfers in, Plaid rows from the Truist feed, manual wires - unmatched until matched, with the four-rung ladder (`account` / `reference` / `heuristic` / `manual`) computed in ONE SQL read. The heuristic rung pre-selects and **never auto-confirms**; a test asserts it.
- **The `account` rung is a slot, not a feature.** Nobody issues us per-order virtual account numbers yet. The column (`account_ref`) and the query parameter exist; when orders grows a per-order account reference, pass it as `$2` to `candidates.sql` and the exact match starts firing. That is the only orders change this lane asks the lots lane for.
- **`payments.bank_links` (152) is a vault REFERENCE and never a number.** Moov account id, bank account id, payment-method id, last four, status, and how it was linked (Plaid / micro deposits / vendor form). Bank numbers cross this API exactly once, outward, in the micro-deposit fallback; nothing stores them and two tests assert what does not reach the wire.
- **Both vendors sit behind one interface with a recording fake, and the app boots without keys.** No live call was made and no `.env` was touched. `MOOV_ACCOUNT_ID`, `MOOV_PUBLIC_KEY`, `MOOV_SECRET_KEY`, `MOOV_WEBHOOK_SECRET`, `MOOV_WALLET_PAYMENT_METHOD_ID`, `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` and `PLAID_TRUIST_ACCESS_TOKEN` are Jacob's to add; the presence of `MOOV_SECRET_KEY` / `PLAID_SECRET` is what switches each live adapter on.
- **TWO VENDOR DETAILS ARE UNVERIFIED AND MUST BE CONFIRMED BEFORE THE FIRST LIVE CALL**: Moov's webhook signing string (implemented as HMAC-SHA512 over `timestamp|nonce|webhookID|body`, constant-time, five-minute window) and the account-scoped transfer paths. They were written from the documented API with no request ever made. Plaid's ES256 `plaid-verification` JWT is the documented scheme and is tested against a locally generated P-256 key pair.
- **An unsigned webhook answers 401**, not 400: an unsigned caller is an unauthenticated one, and `shared/http/tests/endpoints.test.ts` treats `/api/webhooks/moov` and `/api/webhooks/plaid` as guarded routes rather than adding them to PUBLIC.
- **`shared/db/tests/transaction-side-effects.test.ts` gained a `rails` rule**, so a Moov or Plaid call inside a transaction fails the build the way a carrier call does. It passes: every rail call happens after the commit, and `sendPayout` writes `Processing` and commits BEFORE asking Moov, so a crash leaves a visible Processing row rather than a payment nothing recorded.
- **Coverage's domain ratchet moved 86/73/89/88 -> 88/77/92/91** (measured, floored): every route is driven by an HTTP test as a real admin or customer, and four dead helpers written on the way (`isTerminal`, `dollarsOf`, `assertNotTerminal`, `assertProviderAccepted`, plus `rails.openTransfer`) were deleted rather than left as coverage debt.
- **`pnpm check` is green except `figma:inventory` (pre-existing) and three dev-database members blocked by the OTHER lanes**: `dump:schema`/`verify:genesis`/`verify:backfill` refuse with `NATIVE_SCHEMAS does not list: crm, lots, refining`, `contracts:verify:fresh` refuses with `no entity name for auth.otp_throttles` then `orders.lots`, and `contracts:validate`/`api:validate:wire` diverge on one table because the lots lane added `DROPOFF` to `fulfillments.category` on dev. Run individually, `audit:coverage`, `audit:indexes`, `audit:query-paths`, `audit:constraints` and `audit:nullability` are all GREEN - which is what says the five new tables are indexed on the columns their queries filter on. `000_genesis_schema.sql` was regenerated from `test_rails_lane` instead (440 added lines, none removed) so it carries the five new tables; **it needs one more `dump:schema` against dev once the three lanes converge.** Detail in `docs/waves/payment-rails.md`.
## D216 - Passwordless, phone-first auth, plus SMS and calls (2026-09-06, rulings 91-94, 96)

Passwords are gone from the API. `emailAndPassword`, `emailVerification`,
`user.changeEmail` and the `magicLink` plugin are out of the better-auth config
(pinned 1.6.9, not bumped), replaced by its `phoneNumber` and `emailOTP` plugins
mapped onto the existing snake_case columns; `set_password`, the reset and
change-password surfaces, three raw mail templates and `sendAuthVerificationEmail`
are deleted. **No password row in `auth.account` was deleted and no `exchange`
table was touched** - they simply stop being read. Eight endpoints under
`/api/account` feed all twelve Figma "Auth Form" states from one
`VerificationView` plus a `ChangeConfirmedView`, and every rule the design carries
is a test: a factor change is verified through the OTHER factor with no choice,
sign-in is free choice, step-up only for a session older than five minutes,
the OLD value notified after commit, one factor per session, enumeration-safe
responses padded to a constant-time floor so shape AND timing match for a known
and an unknown identity, a five-attempt lockout with a fifteen-minute cooldown,
and masking everywhere except the caller's own new value on the confirmed screen.
SMS is a provider (`send` + signature verification) with a **recording fake as
the default**, so the app boots with no Twilio keys and nothing in a test run can
reach the network; the real adapter is written against Twilio's documented REST
API and refuses to construct without its keys. **The Twilio signature constant
quoted in this lane's brief (`RSOYDt4T1cUTdK1PDd93/VVr8B8=`) does not reproduce
from the inputs given with it**; the algorithm was implemented from the
documentation instead and the HMAC primitive is pinned against an external
HMAC-SHA1 vector, so the test proves the hash rather than its own output.
`crm.sms_messages` and `crm.calls` are one table each for both directions, the
four Twilio webhooks mount before the JSON parser and are idempotent on
`provider_sid` and order-tolerant on status, and `GET /api/customers/:id/timeline`
merges sms, calls and emails in ONE SQL read. Calls are a softphone with a
voicemail path; **there is NO frontend for them (ruling 96)** and no Figma design
for the `voicemail_received` notice either, which is why it wears the plain base
layout - **it wants a design**. Migrations **142, 143 and 144** are additive and
dev-only; 144's index on `auth.verification (identifier)` is a column every OTP
check filters on that better-auth's own schema never indexed. **Genesis carries
144 by hand**, because dev has moved under this branch (the lots and refining
lanes are at 167) and a regeneration would import their schemas.
**Five dev-db gate members fail for that reason - `verify:fresh`, `verify:genesis`,
`verify:backfill`, `audit:non-finite` and both wire validators, on `orders.lots`,
`lots`/`refining` and 167's new `fulfillments.methods.category` label - and not one
of them names anything this wave wrote.** **THE FRONTEND IS BROKEN ON PURPOSE (ruling 44)**: seven
files still call `useSetPassword` or better-auth's password and magic-link
methods, and `auth.setup.ts` still signs in with a password - all listed in
`docs/waves/auth-passwordless.md`, none fixed, and the gate runs no frontend
member. **What Jacob owes**: eleven env keys, four Twilio webhook URLs on the one
business number, a TwiML App whose SID is an env key rather than a database row
(dev, UAT and prod each need a different one), the A2P 10DLC campaign that gates
OUTBOUND messaging only, and Cloudflare bot rules allowing the webhook paths.
Detail in `docs/waves/auth-passwordless.md`.
## The lots model is built (ruling 98, lots lane)

- `lots.items` is the physical lot and the only line table; `checkout.lots`, `orders.lots` and `refining.lots` link it and carry only the money of their own stage, each with `lot_id UNIQUE` — which is what "the id survives from the basket to the refiner" means. `refining.orders` is the business's own order to a counterparty, with its own number and direction: a customer PURCHASE feeds a refiner `sell` order, a customer SALE is filled by a refiner `buy` order. `one_open_sell_order_per_refiner` is the pooling mechanic as a partial unique index, and `refining.pool` is an append-only signed ledger per refiner per metal. Migrations 160-167, all additive, `exchange` untouched. `docs/waves/lots-build.md` has the route table and the full list.
- **`docs/model/lots.md` question 12 is answered the other way, and it matters.** The write-up derives a catalogue lot's content and gates the backfill on `products.bullion.content = gross * purity`. Measured on dev 2026-09-08: that holds for **one of 62** rows — the catalogue's `content` is the ADVERTISED FINE content, so deriving it would apply purity twice, an 0.1-8.3% understatement on every bullion line ever placed. A catalogue lot snapshots its fine content into `content_snapshot` and `content` generates from it; a scrap lot generates from its own weights. 81 of 81 bullion lots reproduce exactly; 15 of 22 scrap lots move by rounding only, the worst by 4.75e-4 t oz, and 161 refuses to commit above 1e-3.
- **`orders.items`, `checkout.items` and `refiners.*` still hold every row and are no longer read or written.** Dropping them is one migration, deliberately not written in this lane — it belongs a release after these reads have actually run. Until then `verify:backfill` still rebuilds and compares them.
- **`refiners.spots` has stopped pricing the profit report.** Dorado's and the refiner's ounces are valued at the pool's most recent `lock` price for that refiner and metal at or before the settlement, falling back to the live bid (lots.md question 9). That is the one number in `profit_breakdown.sql` that moves, and it has not been compared against a real order's old answer.
- **The Finalize gate is written down and enforced** (`rules.finalizeBlockedBy`): purchase direction, lots present, every lot confirmed, every lot priceable. It deliberately does NOT read `orders.orders.status` — a status is a pure label (ruling 2), and confirming a lot is the admin recording that the metal arrived. `actions.finalize_blocked_by` returns the same list the endpoint refuses on.
- **Drop-off exists as a table and a method, and nothing books one.** `fulfillments.dropoffs` (driver, refinery, window, `departed_at`, `dropped_off_at`) and `fulfillments.fulfillments.refining_order_id` are in 166/167; `fulfillments/dropoffs/**` beside `pickups` and `directs` is the logistics lane's own pass. Linked Fulfillment is a read of the linked order's shipment state and is likewise unbuilt.
- **The six new document kinds are named, not rendered.** `media.pdf_kind` gained seven labels and `GET /api/orders/:id/documents` answers what a handover method prints and whether it is available (an Invoice waits for finalization). Rendering Pickup Manifest, Intake Receipt, the two Instructions sheets, Settlement and Lot Manifest is a documents lane.
- **`scripts/dump-schema.mjs` gained two general fixes** that had nothing to do with lots and would have bitten the next generated column or sequence: it emits a STORED generated column as one rather than as a DEFAULT (which Postgres refuses), and it emits standalone sequences before the tables, beside the functions, because both are resolved at CREATE TABLE time.
- **The frontend is not touched and will not typecheck.** `@dorado/client` moved with the API (`useCheckoutLots`, `useOrderLots`, `useFinalizeOrder`, `useReopenOrder`, `useSupplyOrder`, the whole `refining` module); the app calls the old hooks. `docs/waves/lots-build.md` lists every wire shape that moved for that pass. The gate runs no frontend member.
- **Cross-lane, and worth a second look at merge:** this lane added `crm` to `NATIVE_SCHEMAS` and six ENTITY names for the auth and rails lanes' tables (`payments.bank_links`, `feed_cursors`, `inbound_transactions`, `transfers`, `transfer_events`, `auth.otp_throttles`, `pending_changes`, `pending_signups`) because `dump:schema` and the contract generator refuse to run while a schema or table they can see is unnamed, and the dev database is shared. Genesis and `packages/contracts/src` therefore carry those lanes' tables. Whoever merges should regenerate both rather than resolve the conflict by hand.

## The passwordless auth screens are built (ruling 91, frontend lane)

- **Eleven routes under `app/auth/**` and `app/settings/**`**, every frame of the Figma "Auth" file Desktop and Mobile, on one `AuthShell` (Panel + Pitch, Back row, logo) that `LayoutProvider` renders full-bleed — no site nav, no footer. One `AuthForm` client component carries the twelve states, and the API's `VerificationView` drives every one of them: `codeStateFor(view)` is the whole state machine, `attempts_remaining`, `locked_until`, the masked destination and the code length are read, never computed. Route table, state table and the deleted password surface are in `docs/waves/frontend-auth.md`.
- **The old auth is gone**: `/authentication`, `/change-password`, `/reset-password`, `/change-email`, `/verify-email`, `/verify-login`, `PasswordRequirements`, `ChangePasswordForm`, the `magicLink` plugin and every password method on the better-auth client. The account page's Details and Security panels were rewritten to the new flow — masked factors as disabled Inputs with "Change" beside them. **`shared/hooks/auth/queries.ts`'s `useSetPassword` import was the frontend's one auth typecheck error and it is gone: 55 errors before, 54 after, none of them auth's.** The 54 belong to the lots and payment-rails lanes and are listed by file in the wave doc.
- **Two API gaps are listed, not bent (ruling 44).** `confirm_change` answers an ERROR for a wrong code rather than a `VerificationView`, so the change-confirm OTP screen cannot show attempts remaining the way every other code screen does. And nothing intercepts a 401 to route to `/auth/session-expired` — the screen exists and renders, but the interception belongs in `@dorado/client`'s `apiRequest`.
- **Three design gaps worth Jacob's eye.** The Confirmed frame is drawn for email only; the phone flow gets the same state with the noun swapped at `/settings/phone/confirmed`. `/auth/locked` reached directly has no `locked_until`, so its alert says "Try again later" rather than a number nothing verified. And "Wrong number?" is the only back-link copy drawn, which is wrong over an email destination — "Wrong email?" is ours. Apple and Facebook stay omitted: no marks yet, as the design's own note says.
- **The e2e harness signs in through OTP.** `shared/tests/auth.setup.ts` sends through better-auth's `phone-number/send-otp`, reads the code from `GET /api/account/last_code?number=` and mints the session with the real `/api/account/verify_code`; the seeded numbers are `+15555550100` and `+15555550101` and no password exists anywhere in it. The sign-in FORM is still not submitted by any spec — `send_code` runs the captcha and a headless browser is exactly what it refuses — so `app/auth/_src_/tests/auth-screens.e2e.ts` proves the screens, the channel switch and the empty-flow bounce instead. A captcha-tolerant form spec is still owed.
- **The e2e BROWSER specs could not run, and not for an auth reason.** Under `next dev` every route in the app answers 500, the new ones included, on exactly three errors: `useCheckoutItems`, `useClearCheckoutItems` and `useReplaceCheckoutItems` are imported by `shared/hooks/checkout/items/queries.ts` and `@dorado/client` renamed them to the `*CheckoutLots` trio. `shared/ui/Shell.tsx` imports that file and `LayoutProvider` renders Shell, so the broken module is in every page's graph. It is NOT a rename — the payload went `{ items }` -> `{ lots }` and the row type `CheckoutItem` -> `Lot` — so repairing it is the lots lane's frontend pass and is deliberately not done here. What DID run and pass: the real `auth.setup.ts` through Playwright's setup project, both roles, 7.5s — send-otp, `last_code`, `verify_code` answering `verified`, real cookies. `app/auth/_src_/tests/auth-screens.e2e.ts` is written and waiting on that pass.

## The frontend is back on the API (ruling 44, frontend sync lane)

- **Every route renders again, and the fix was three files.** `next dev` answered 500 on all 26 routes because `shared/hooks/checkout/items/queries.ts` imported three exports `@dorado/client` had renamed, and `shared/ui/Shell.tsx` puts that module in every page's graph. The basket is `checkout.lots` -> `lots.items` now: `checkoutItems.ts` -> `checkoutLots.ts`, `utils/basket.ts` over `Lot[]`, and `hooks/checkout/items/` -> `hooks/checkout/lots/` with the PUT body key `lots`. **Frontend typecheck 54 -> 0** (66 at the peak), `test` 212 passed, `build` green, `lint:client-boundary` green, e2e **76 passed / 0 failed** on two consecutive runs. Every route status code, every error by file and every spec change with its ruling are in `docs/waves/frontend-sync-2026-09-08.md`.
- **`@dorado/client` gained the payment rails and lost the refiner engagement.** `payments/rails.ts` is 23 hooks, one per route in `docs/waves/payment-rails.md` - `usePaymentView` down to `useRecordVaultedLink` - with no `usePatchTransfer`, because a payout's and a charge's state only an endpoint moves. **Nothing renders them yet**: the Payment card is a Figma frame and ruling 96 says an unbuilt frame is not invented in code. Removed with no successor: `useRefinerOrder`, `useRefinerMetals`, `useRefinerItems`, `usePatchRefinerItem`, `usePatchRefinerOrder` - they addressed the engagement BY CUSTOMER ORDER ID and no key joins a refining order to a customer order any more (ruling 42).
- **Three admin surfaces were kept alive, not rebuilt** (`docs/design/orders-notes-2026-09-05.md` is redrawing the admin order page from Figma). `editRefinerValues.tsx` is DELETED with its mount - it edited `refiners.orders`/`refiners.items`/`refiners.spots` and all three are gone. `editActualValues.tsx` kept Scrap Actuals (writing `PATCH /orders/lots/:id`, one field per blur instead of a read-modify-write that could lose a concurrent edit) and Shipping Actual, and lost its Pool panel. `AdminPreparing.tsx` lost its pre-selected supplier: nothing reads an order's refiner back. Split, assign and Add-Lot are Figma work and are not built.
- **Two API gaps listed rather than bent, and one guard that earned its keep.** `ShipmentPatch` is strict and no longer carries `carrier_id`, so the admin sales drawer PATCHes a tracking number alone and cannot re-point a carrier. A refining order still cannot be reached from a customer order - by design, but it is why the purchase drawer can show no assay. And `orders/rules.ts` `assertEveryLineCopied` fired once under parallel e2e workers ("1 basket line(s) to copy, 3 written"), rolled the transaction back and wrote nothing - correct behaviour, and a sign that three specs sharing ONE e2e customer's sale basket is a harness fragility worth fixing.
- **A pre-existing red test this lane found and fixed:** `shared/tests/convertWeights.test.ts` asserted the rounded 31.1035 g/t oz and 453.592 g/lb to ten and six decimal places against a util that uses the exact constants - arithmetically impossible, and red on the branch before this pass began. The test now carries the util's own numbers.

## The frontend is nuked to auth (ruling 99, nuke lane)

- **323 files deleted, 16 modified, and the API did not change.** Every customer and admin surface is gone — `app/(checkout)`, `account`, `admin`, `buy`, `images`, `order-placed`, `payout-options`, `privacy-policy`, `rates`, `sales-tax`, `sell`, `terms-and-conditions`, `sitemap.ts` — along with `shared/store` (the whole zustand layer), `shared/types` bar `routes.ts`, and everything in `shared/{ui,hooks,utils,tests}` unreachable from the kept entry points. `frontend/app` + `frontend/shared` went from ~290 files to **70**. Kept: the app skeleton, `app/auth/**` and `app/settings/**` with `AuthShell`/`AuthForm`, all six providers, the e2e harness, and a placeholder `app/page.tsx` of three `@dorado/components` Figma components. `docs/waves/frontend-nuke.md` is the record. **Typecheck 54 → 0, test 58 passing (auth only), build green at 14 routes, e2e 8/8, `pnpm check:fast` green except the pre-existing `figma:inventory`.**
- **`@dorado/client` keeps TanStack Query and loses every resource module.** Sixteen went — addresses, checkout, fulfillments, leads, media, orders, payments (queries and rails), pdfs, products, quotes, rates, refiners, reviews, shipping, spots, users — plus `src/tests`. What remains is `fetch.ts`, `keys.ts` (fifteen namespaces down to `auth`), `session.ts`, `cache.ts` and `auth/queries.ts`. The package's eight subpath exports are gone; `test` carries `--passWithNoTests`. **They regrow one per surface**, which is the point: a hook with no caller is a hook nobody has checked against the route it names.
- **Six floors moved and none was removed**, because a guard whose subject is deleted becomes a scan over nothing: `lint:client-boundary` 100 → 55 frontend files, `frontend-routes.test.ts` 45 → 9 calls, `browser-triggered-effects.test.ts` 95 → 9 with its control repointed from `queryFn GET /spots` to `queryFn GET /account/session`, and `mirror.test.ts`'s PAIRS emptied — with a NEW test that fails if `convertWeights.ts` or `resolveRate.ts` returns to the frontend without a PAIRS entry, since an empty list otherwise passes every assertion trivially. Each floor rises again as surfaces are built.
- **Four guards were deleted with their subjects, and one of them is worth arguing with.** `lint-carrier-vocabulary.mjs`, `lint-list-fanout.mjs` and `audit-state-collapse.mts` guarded files that no longer exist. **`api/scripts/audit-frontend-nullability.ts` is the contested one**: CLAUDE.md describes it at length, but there is not one `z.object` left in `frontend/` and both its self-test CONTROLS named schemas in deleted forms. Its own error message says never to just remove a control — honoured by deleting the whole script rather than keeping a detector that cannot fire. **It is owed back with the first frontend zod schema**, and CLAUDE.md's Verification list still describes it as if it exists.
- **Two things left knowingly broken, neither this lane's to fix.** `Hero`'s own CTAs point at `/sell` and `/buy` and both 404 — the copy is the design system's and `packages/components` is Jacob's. And `pnpm --filter @dorado/frontend lint` fails before it starts (`typescript-eslint` 8.69 refuses TS 7.0), which predates this lane and is not in `pnpm check`. One incidental fix WAS made: `app/layout.tsx` exported its two font objects, which Next 16 rejects from a layout, and `next build` was failing on it beforehand.
