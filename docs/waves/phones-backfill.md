# Every existing customer gets a sign-in number (ruling 108, phones lane)

Jacob: *"address phone numbers should be sent to user phone numbers... it
should be largely 1 to 1."*

Auth is passwordless and phone-first since 142-144: the code is the only key and
`auth.users.phone_number` is what a sign-in resolves an account by. A customer
who registered before that cutover has an email and no number, so there is
nothing for the OTP to go to. They did give us a phone, once — on the address a
parcel was going to. Migration
**`172_backfill_sign_in_phones_from_the_address_book.sql`** carries it across.

Purely additive, no DDL, `exchange` read and never written. It is picked up by
`verify:backfill` because it is named `backfill`, so ruling 82's production day
replays it in its own place in the order rather than as a separate step.

## The rule

For each account with **no** `phone_number` that is not an anonymous visitor:

1. **Collect** the numbers on that customer's address book —
   `places.user_addresses` → `places.addresses`. Where the native row carries no
   number the same address id is read out of **`exchange.addresses`**, the
   frozen source every native address was derived from and the only place an
   older number can still be.
2. **Normalise** to US E.164: strip punctuation, drop a leading country code 1,
   then check the ten digits are a real NANP number (area code and exchange code
   both starting 2-9) — the same `US_E164` shape
   `domains/accounts/auth/rules.ts` enforces on every number the API accepts.
   Anything else (an extension, a nine-digit typo, an international number) is
   **not carried**. A wrong number here sends a stranger the code to somebody's
   account *and* locks its real owner out; silence is the safe failure.
3. **Choose**, when several addresses carry a number:
   - the number on an address that has actually been **used on an order** —
     `orders.addresses.source_address_id` is the link from an order's snapshot
     back to the book row — **most recent order first**;
   - otherwise, when the customer has no order against any of their addresses,
     the **earliest created** address;
   - `address_id` last, so two addresses created in the same transaction still
     resolve the same way on every run. An unstable `ORDER BY` would make this
     non-idempotent by accident.
   *(Jacob revised this mid-lane: the default-shipping flag is not consulted at
   all. A book entry can be flagged default and still be a relative's house,
   while an address FedEx delivered to is a number the customer answered.)*
4. **Set** `phone_number` and `phone_number_verified = false`. Nobody has
   answered a code on it yet; they prove it on their first OTP sign-in, which is
   exactly what the flag is for.

**Never overwrite.** Only a row whose `phone_number` IS NULL is touched.

**Anonymous visitors are excluded.** An `"isAnonymous"` row (122) is a basket
identity, not a sign-in, and `users_one_phone_number` is UNIQUE: a number spent
on a visitor row is a number the real person can never sign up with. Neither dev
nor the production-shaped copy has one with an address, so this excludes nothing
today and forecloses it on the day one does.

**Two people, one number: neither is filled.** A household shares a landline and
a business shares a switchboard, so two customers can honestly hold the same
digits — and only one of them can sign in with it. Where a chosen number already
belongs to another account, or two customers would receive the same one, the
migration writes **neither** and raises the customer **ids** in a `NOTICE`. No
number is ever printed. Picking which of two people owns a shared line is a
human decision, not a migration's.

**Idempotent.** A second run finds every filled customer holding a number and
skips them; a collision is still a collision, because neither half of it was
written. It is one statement with no temporary table, so
`verify:backfill`'s three replays inside a single transaction change nothing
after the first.

## What it reports

Four `RAISE NOTICE` lines — accounts without a number, filled, skipped for no
valid number, left for a human — plus one line per shared number carrying the
customer ids that share it.

`scripts/migrate.mjs` was **dropping every NOTICE on the floor**: `pg.Client`
emits them only if something listens, and nothing did. So 165's unresolved
engagements and this migration's counts were being computed and thrown away — on
production day, in front of the one person who needed to read them. The runner
now buffers notices per migration and prints them indented under the
`applying … ok` line they belong to.

## Dev, 2026-09-11

| | |
|---|---|
| accounts holding no sign-in number | 11 (of 21; 8 anonymous, 2 already had one) |
| filled from the address book | **8** |
| no address carrying a valid US number | 3 |
| left for a human (shared number) | **0** |
| chosen from an ordered address / earliest address | 8 / 0 |
| malformed values written | 0 |

## Rehearsal on a production-shaped copy, 2026-09-11

`createdb -T chain6 phones_rehearsal` on 127.0.0.1:5544, the chain rehearsed
forward, 172 applied and then applied again, copy dropped. Counts only — no
customer data was printed or recorded.

| | |
|---|---|
| accounts holding no sign-in number | 79 (0 anonymous) |
| filled from the address book | **66** |
| no address carrying a valid US number | 11 |
| left for a human (shared number) | **2 customers, 1 shared number** |
| chosen from an ordered address / earliest address | 47 / 19 |
| customers whose book held more than one distinct number | 4 |
| malformed values written | 0 |
| second run | filled 0, total unchanged at 66 |

**What a collided customer must do**: nothing changes for them — they keep
signing in by email, exactly as they do today, and the sign-in screen's "Email
me the code instead" is the whole workaround. What is owed is a human decision
about which of the two accounts owns the line. Once somebody decides, the owner
adds the number through `/settings/phone` (which proves it with a code, so the
number ends up `phone_number_verified = true` rather than false) and the other
account either stays email-only or adds a number of its own. Re-running 172 will
not resolve it: with one of the pair now holding the number, the other's
candidate is "already somebody else's" and is still declined — which is correct,
and is why the migration refuses to guess.

**One thing the rehearsal found that is not this lane's**:
`161_backfill_lots_from_order_items.sql` **fails on a production-shaped
database** — `a lot content moved by 0.002010 t oz, which is a price change and
not a rounding residue`. The chain stops there, so the rehearsal applied 134-160
and then 172 directly. That is a real production-day blocker and it belongs to
the lots lane, not to phones.

## Declared

- **`scripts/lib/feature-map.ts`** — a `FLOWS` entry under `users`:
  `exchange.addresses.phone_number` → `auth.users.phone_number`. A value flow,
  not an ownership mapping, which is the kind of movement `FLOWS` exists to keep
  visible. `audit:precision` compares the two types and finds nothing, because
  both are `text`; what makes it honest is that the movement is written down.
- **`scripts/verify-backfill.mjs`** — `auth.users`'s `NOT_REBUILT` reason now
  names 172 and says why the phone column is deliberately *not* row-compared
  against dev: dev's two existing numbers were set **natively** through the
  passwordless flow, so a rebuild deriving them from addresses would differ for
  a legitimate reason, and declaring `phone_number` `native` to silence that
  would make the comparison assert nothing. What the rebuild does prove is that
  172 runs to completion against a schema built from `exchange` alone and that a
  second and third run change no row.

## Tests

`api/src/domains/accounts/auth/tests/phone-backfill.test.ts`, eight cases, each
running **the migration file itself** rather than a TypeScript re-statement of
its rule — a copy of the rule would pass while the file production runs said
something else, which is the one failure a backfill test exists to prevent.

The ordered address beats the default-shipping one; the most recent order wins
between two ordered addresses; a customer with no orders takes their earliest
address's number; an existing number is never overwritten and its
`phone_number_verified` is not reset; two customers who would share a number are
both left alone (typed differently on each address, so the collision is only
visible *after* normalisation); a number already held is not taken from its
owner; four unusable shapes are not carried; and running it twice changes
nothing.

## Gates

`lint:migrations` green (166 files), `verify:genesis` green (no DDL, so genesis
is unchanged), `verify:backfill` green at **0 undeclared differences** with 172
in the rebuild set, `pnpm check` green.
