# Payment rails: Moov, Plaid, and the two state machines (ruling 97)

Executed on `rails-lane`, 2026-09-06. Nothing committed.

Jacob's vendor findings and working plan are section 6 of
`docs/design/orders-notes-2026-09-05.md`; the Payment card's states are the
`Payment` row of section 3. This wave builds what those two describe: Moov and
Plaid behind interfaces, the payout and charge state machines as ROWS, and the
inbound-transaction matching that the Matching picker drives.

Nothing here calls a vendor. No key exists in any `.env`, and the app boots
without one: `providers/moov/index.ts` and `providers/plaid/index.ts` return
their **recording fake** whenever `MOOV_SECRET_KEY` / `PLAID_SECRET` is absent,
and the whole suite runs against those fakes.

## The two machines

They are one enum, `payments.transfer_state`, whose labels are spelled the way
the Payment card renders them so nothing translates between the database and
the screen:

```
payout   Not sent ──Send payment──► Processing ──Moov webhook──► Sent
charge   Due      ──Request pay──► Processing ──Moov webhook──► Received
                                        │
                            (any state) └──────────────────────► Failed + reason
```

A wire skips the middle: an admin marks it Sent by hand with the reference the
bank gave them (`provider = 'manual'`). A card charge keeps the Stripe path
entirely and joins at the end - `payment_intent.succeeded` calls
`rails.settleCardCharge`, which is what makes the charge Received.

Three properties, each pinned by a test:

- **The row is written first.** `sendPayout` writes `Processing` and commits,
  and only then asks Moov for a transfer. A crash between them leaves a
  Processing payout with no provider reference, which an operator can see - not
  a payment that happened and nothing recorded.
- **Every transition is idempotent on the provider's event id.**
  `payments.transfer_events` is unique on `(provider, event_id)`; the insert is
  `ON CONFLICT DO NOTHING RETURNING *`, and no row back means "already applied".
- **Out-of-order events are tolerated.** States are ranked, and a transition
  only ever moves forward. A late `pending` arriving after `completed` is
  recorded and applied to nothing.

A failure is a state with a reason (`failure_reason`), never a silence.

## The tables (migrations 150-152)

| table | what it is |
|---|---|
| `payments.transfers` | one row per money movement, in or out. `kind` (payout/charge), `rail`, `state`, `amount`, `reference`, `provider`, `provider_ref`, `failure_reason`, `sent_at`, `completed_at`. Audit-stamped. |
| `payments.transfer_events` | one row per provider event. Unique `(provider, event_id)`. Append-only; `applied` says whether it moved anything. |
| `payments.inbound_transactions` | every inbound movement we learn of - Moov transfers in, Plaid rows from the Truist feed, manual wires an admin records. `Unmatched` until matched. |
| `payments.bank_links` | a REFERENCE to somebody else's vault: Moov account id, Moov bank account id, the Moov payment-method id, last four, status, and how it was linked. No routing number, no account number, encrypted or otherwise. |
| `payments.feed_cursors` | the one row Plaid's Transactions sync needs to be resumable. |

**Ruling 74 is intact.** There is no payouts table. The account a payout goes
to is still `payments.details` (sealed envelopes, legacy rows) or a
`payments.bank_links` vault reference; what these tables add is the MOVEMENT,
which nothing held before.

Two indexes carry a decision rather than a lookup:

- `transfers_one_live_per_order_kind` is unique on `(order_id, kind)`
  `WHERE state <> 'Failed'`. Opening the same payout twice returns the same row
  (the create is an upsert), a payout is never sent twice, and a fresh attempt
  after a failure is a new row.
- `inbound_transactions_source_external_key` is unique on
  `(source, external_id)`, so the same feed row read twice is one movement.

## Matching: the ladder

`db/payments/inbound/sql/candidates.sql` is ONE read that labels every
unmatched movement with the rung it reached for this order and returns the
strongest first:

| rung | how it matches | what it means |
|---|---|---|
| `account` | `account_ref = $2` | exact. **A slot, not built** - nobody issues us per-order virtual account numbers yet. The parameter and the column exist so that the day Moov or a bank does, the exact match is a `WHERE`. |
| `reference` | the memo contains `SO-####` / `PO-####` | a strong hint, not proof. |
| `heuristic` | amount within $0.50 **and** the counterparty name contains the customer's | a pre-selection. **It never auto-confirms**, and a test pins that. |
| `manual` | everything else still unmatched | the floor that always works. |

Confirming a match is one transaction: the inbound row becomes `Matched` with
`order_id`, `transfer_id`, `matched_at` and `matched_by_id`, and the order's
charge moves to `Received`. Unmatching reverses both - the movement returns to
the unmatched list and the charge returns to `Due`.

## Routes

Every payment route is admin-only except the customer's own bank linking.

| method | path | who |
|---|---|---|
| GET | `/api/payments/view/:orderId` | admin - the Payment card, one SQL read |
| POST | `/api/payments/payouts` | admin - open (idempotent) |
| GET | `/api/payments/payouts/pay_to` | admin - the "Pay to" select for `?user_id=` |
| GET | `/api/payments/payouts/:id` | admin |
| POST | `/api/payments/payouts/:id/send` | admin - Send payment |
| POST | `/api/payments/payouts/:id/mark_sent` | admin - a wire, with its reference |
| POST | `/api/payments/payouts/:id/fail` | admin |
| POST | `/api/payments/charges` | admin - open (idempotent) |
| GET | `/api/payments/charges/:id` | admin |
| POST | `/api/payments/charges/:id/request` | admin - Request payment |
| POST | `/api/payments/charges/:id/fail` | admin |
| GET | `/api/payments/inbound/unmatched` | admin |
| GET | `/api/payments/inbound/candidates?order_id=` | admin - the pre-selection |
| POST | `/api/payments/inbound/wire` | admin - record a wire by hand |
| POST | `/api/payments/inbound/sync` | admin - pull the Truist feed |
| POST | `/api/payments/inbound/:id/match` | admin - Confirm match |
| POST | `/api/payments/inbound/:id/unmatch` | admin |
| GET | `/api/payments/banks` | the customer's own links |
| POST | `/api/payments/banks/link_token` | Plaid Link token (an admin may name another customer) |
| POST | `/api/payments/banks/vaulted` | admin - record a refiner's vendor-form vault reference |
| POST | `/api/payments/banks/link` | public token -> processor token -> Moov |
| POST | `/api/payments/banks/micro_deposits` | the Moov fallback |
| POST | `/api/payments/banks/:id/verify` | confirm the two amounts |
| POST | `/api/webhooks/moov` | signature only - raw body, before `express.json` |
| POST | `/api/webhooks/plaid` | signature only - raw body, before `express.json` |

An unsigned webhook answers **401**: an unsigned caller is an unauthenticated
one, and the endpoints test treats it as any other guarded route.

## Contracts

Generated from the tables: `Transfer`, `TransferEvent`, `InboundTransaction`,
`BankLink`, `FeedCursor`, plus `payments/enums.ts` (`Rail`, `TransferKind`,
`TransferState`, `InboundSource`, `MatchState`, `LinkStatus`, `LinkMethod`).
Hand-written derivations: `Payout`, `Charge`, `TransferWrite`, `TransferPatch`,
`TransferGuard`, `PayTo`, `PayoutAccount`, `PaymentView`, `MatchCandidate`,
`MatchRung`, `InboundTransactionWrite/Patch`, `BankLinkWrite/Patch`.
Request bodies and the Plaid token live in `computed/payments.ts`, declared in
`lint-contracts-derived`'s COMPUTED map.

`PaymentView` is one SQL read that answers even when the order has no payment
row yet (every payment field comes back null), and it **masks the provider
reference** to `****NNNN`.

## Bank numbers

They cross this API exactly once, outward, in the micro-deposit fallback: the
body goes straight to Moov's vault and neither the request nor any row keeps
it. What is stored is the Moov ids and the last four. A test asserts the stored
row has no routing/account column, and another asserts the "Pay to" list
returns no vendor account id to the wire (it is parsed through `PayTo`).
Refiners never touch this API at all - their account is vaulted through Moov's
own vendor form, and `POST /api/payments/banks/vaulted` is where an admin
records the reference it hands back.

## What Jacob must configure

**At Moov** (sandbox first): a platform account, the OAuth client
(public/secret), a wallet funded enough to originate payouts, and a webhook
endpoint pointed at `POST /api/webhooks/moov`. Then in `api/.env`:

```
MOOV_ACCOUNT_ID=                     the platform account
MOOV_PUBLIC_KEY=                     OAuth client id
MOOV_SECRET_KEY=                     OAuth client secret  (its presence switches the live adapter on)
MOOV_WEBHOOK_SECRET=                 the endpoint signing secret
MOOV_WALLET_PAYMENT_METHOD_ID=       the wallet's paymentMethodID - the source of every payout and the destination of every charge
MOOV_HOST=                           optional; defaults to https://api.moov.io
```

**At Plaid**: a Link customisation with the `auth` product, the Moov processor
enabled, an Item linked to the Truist operating account, and a webhook pointed
at `POST /api/webhooks/plaid`. Then:

```
PLAID_CLIENT_ID=
PLAID_SECRET=                        its presence switches the live adapter on
PLAID_ENV=                           sandbox | production
PLAID_TRUIST_ACCESS_TOKEN=           the Item access token for the Truist feed
```

**Two things to confirm against the vendor dashboards before the first live
call**, because they were written from the documented API and no request has
ever been made:

1. **Moov's webhook signing string.** `providers/moov/signature.ts` computes
   HMAC-SHA512 over `timestamp|nonce|webhookID|body` and compares in constant
   time with a five-minute freshness window. If Moov's console shows a
   different join, change `signingString()` - one function, and its tests move
   with it.
2. **Moov's account-scoped transfer paths.** `live.ts` posts to
   `/accounts/{platform}/transfers` and reads
   `/accounts/{platform}/transfers/{id}`. The fixtures pin how we PARSE the
   response either way; only the path and the scope list would move.

Plaid's webhook verification is the documented one (ES256 JWT in
`plaid-verification`, `request_body_sha256` over the raw body) and is tested
against a locally generated P-256 key pair.

## What the lots lane must change in orders

Nothing is required for this lane to work - it reads orders through
`db/orders`' existing `getOne` and its own view SQL. Two things would improve
it, and both belong to orders:

1. **`orders.transactions` has no per-order virtual account column.** When one
   exists (call it `account_ref`), pass it as `$2` to
   `db/payments/inbound/sql/candidates.sql` instead of `null` and the exact
   rung starts firing. No other change is needed.
2. **The Payment card's `amount_due` is decided in SQL** as
   `CASE WHEN direction = 'sale' THEN post_charges_amount ELSE total END`. If
   the lots redesign renames either column, `db/payments/transfers/sql/payment_view.sql`
   and `db/payments/inbound/sql/candidates.sql` are the two files to follow.

## Tests

100 assertions across nine files, all against the fakes:

- `providers/moov/tests/signature.test.ts` - a good signature, a forged one, a
  tampered body, a replay an hour late, each missing header, and no secret at all.
- `providers/moov/tests/fake.test.ts` - pending on create, idempotency replay,
  advance on demand, failure reason, event shape, linking, micro deposits.
- `providers/plaid/tests/verify.test.ts` - a real ES256 JWT over the real body
  verifies; wrong body, wrong key, stale `iat`, non-ES256 and garbage are refused.
- `providers/plaid/tests/fake.test.ts` - link token, exchange, processor token,
  paged sync with a cursor.
- `db/payments/transfers/tests/repo.test.ts` - the one-live-per-order index, the
  state guard, a fresh attempt after a failure, the view with and without a row,
  the masked reference.
- `db/payments/transfer-events/tests/repo.test.ts` - record once, replay writes
  nothing, the same id from another provider is a different event.
- `db/payments/inbound/tests/repo.test.ts` - feed dedupe and all four rungs,
  including the $0.50 boundary.
- `domains/transactions/tests/rail-states.test.ts` - the machines as pure rules.
- `domains/transactions/tests/payout-rail.test.ts` - the ACH happy path, replay,
  out-of-order, failure with a reason, the manual wire, and two refusals.
- `domains/transactions/tests/charge-rail.test.ts` - the RTP happy path, the
  card path landing Received, an order owing nothing, opening twice.
- `domains/transactions/tests/matching.test.ts` - the wire, confirm, the
  never-auto-confirm rule, unmatch, double-match refusal, the Plaid feed.
- `domains/transactions/tests/bank-links.test.ts` - Plaid link, micro deposits,
  ownership, the cached payment method, and what does not reach the wire.
- `domains/transactions/tests/http-webhooks.test.ts` - both webhooks refuse an
  unsigned delivery with 401.
- `domains/transactions/tests/http-rails.test.ts` - every route driven as a real
  admin or customer: open/send/settle a payout, mark a wire, fail a payout,
  the Pay to select, open/request/fail a charge, the whole matching surface,
  the feed pull, bank linking end to end, the admin-only link token, the
  refiner vault reference, and a 404 for an order nobody has.

Coverage's domain ratchet moved with them: 86/73/89/88 -> **88/77/92/91**,
measured and floored.

`shared/db/tests/transaction-side-effects.test.ts` gained a `rails` rule, so a
Moov or Plaid call inside a transaction now fails the build the way a carrier
call does. It passes: every rail call is after the commit.

## The gate, and what the other lanes blocked

`pnpm check` is green except the members that read the SHARED dev database,
which three lanes are migrating at once. Measured 2026-09-06:

- **`api:verify:genesis`, `api:verify:backfill` and every `dump:schema`
  refuse** with `NATIVE_SCHEMAS does not list: crm, lots, refining` - the auth
  and lots lanes have created three schemas on dev whose migrations are not on
  this branch. `scripts/lib/schemas.ts` is shared, and adding their schemas to
  it is their edit, not this lane's.
- **`contracts:verify:fresh` refuses** with `no entity name for` first
  `auth.otp_throttles` (the auth lane) and then `orders.lots` (the lots lane) -
  their tables, whose ENTITY names belong in their diffs. This lane added the
  five payments entries it owns and nothing else.
- **`api:audit:non-finite` refuses** with the same three-schema message.
- **`contracts:validate` and `api:validate:wire` diverge on ONE table**,
  `fulfillments.methods.category`: dev's `fulfillments.category` enum now reads
  `SHIPMENT, PICKUP, DIRECT, DROPOFF` and twelve rows already use the fourth
  label, while the committed contract knows three. That is the lots lane's
  `DROPOFF` (design notes section 3), and regenerating the contract is their
  diff. Everything else passes: 48 of 49 tables and 33 of 34 endpoint shapes.

Run individually, the members that do NOT read another lane's work are green:
`api:audit:coverage`, `api:audit:indexes`, `api:audit:query-paths`,
`api:audit:constraints` and `api:audit:nullability` all pass, which is what
says the five new tables are indexed on the columns their queries filter on.

`000_genesis_schema.sql` WAS regenerated, from `test_rails_lane` (the branch's
own database, which holds the seventeen native schemas and this lane's three
migrations and nothing else), so it carries the five new tables, their enums
and their eleven indexes. The diff is 440 added lines and **no removed line**.
It will need one more `dump:schema` against dev once the three lanes converge -
that is the merge's job, not this lane's.
