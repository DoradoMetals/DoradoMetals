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
