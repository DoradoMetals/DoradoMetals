# Phase 7 — money at rest

Taken 2026-08-29. Jacob: *"Whatever you think is best... you have purview to
make decisions."*

```
1. encrypt-payout-details.mjs, which was cited and never written  ██████████████████  100%
2. The second copy in payments.details            █████████████░░░░░   72%
3. Read paths: last-4 everywhere, full behind admin  ██████████████████  100%
```

## The standing rule, which this phase must not break while fixing it

**Never log or return bank details.** Whoever takes this lane will be holding
plaintext routing and account numbers in a script's memory; they must not appear
in a log line, a test fixture, an error message, a commit, or a terminal. A
failure here is worse than the problem being fixed — the current exposure is at
rest in a private database, and a leaked one is in a log aggregator.

## What is actually true (verified 2026-08-29, read-only)

- `exchange.payouts` holds plaintext `routing_number` / `account_number` on
  **10 ACH + 8 WIRE production rows**.
- **`payments.details` holds a SECOND copy — 10 production rows**, each matching
  an `exchange.payouts` row on (user_id, account_holder), across 8 customers.
  Migration **071** was written to remove exactly this and **has never run on
  production**. The standing note said copying them into `payments.details`
  "would double the exposure"; it already is doubled, from the abandoned January
  refactor.
- **`scripts/encrypt-payout-details.mjs` does not exist.** Migration 073's
  header and `verify-backfill.mjs` both describe it as the mechanism that writes
  those columns, and it was never written.

**One correction to carry forward:** `verify-backfill.mjs` excluding those two
columns from its comparison is **correct** and not a hole — the backfill
deliberately does not write them, and comparing them would assert that a rebuild
reproduces plaintext bank details. An earlier note of mine framed the exclusion
as standing down for a missing script. It is not; only the encryption is missing.

## Why the code half is safe to do without Jacob

**Dev holds no bank details at all.** So the script can be written, unit-tested
against synthetic values, and proven idempotent and reversible on dev without
ever touching a real number. Running it against production is Jacob's, in his
sequence (`pg_dump` first).

That also means the usual trap applies with unusual force: **a script that
processes zero rows looks exactly like a script that worked.** It must refuse to
report success on an empty run, the way `audit:test-leaks` and `validate:wire`
refuse — this codebase has found that same defect at least six times (D95, D99,
D108, D115, D157, D176) and two of those were in a single day.

## Design constraints worth settling before writing code

- **Key handling.** 073 says the script "refuses to run without
  `PAYOUT_ENCRYPTION_KEY` — so a database can be migrated by someone who does
  not hold the key". That design is good and should be kept: migration and
  decryption are separate capabilities.
- **Reversibility.** Encryption at rest that cannot be rotated is a future
  incident. Store the key id alongside the ciphertext.
- **The admin read path already exists** and returns full values from an
  admin-only endpoint, with order responses carrying only last-4. Encryption
  must not change either wire shape (standing constraint), which means
  decrypting in the admin path rather than widening any response.
- **Do not delete the plaintext in the same migration that writes ciphertext.**
  Write, verify, and only then a separate migration clears the column — and that
  clearing is a `-- allow-destructive:` change on `exchange`, so it needs the
  marker, the reason, and Jacob.


---

# WHAT LANDED, 2026-08-29

## Task 3 was ALREADY DONE, and the brief did not know it

Checked before writing anything. `features/payouts/` is already exactly what the
task asks for:

- `sql/get_for.sql`, `get_many.sql`, `get_by_id.sql` project
  `right(account_number, 4)` **in the statement**, so the full value never leaves
  Postgres on those paths and cannot be logged by anything in between.
- `PayoutRow` and `PayoutDetailsRow` are **deliberately separate types**, so a
  projection cannot pick the full numbers up by accident.
- The one read that carries them, `GET /payouts/:id/details`, is behind
  `requireAdmin` in `routes.ts:15`, keyed by the payout's own id, one at a time.

The one place a full account number is handled outside that path
(`features/orders/service.ts:883`) takes it from the CUSTOMER'S OWN REQUEST
BODY, derives `last_four` in memory and writes only that. It never reads a
stored secret. Not a finding.

**So task 3 is 100% without a line changed.** Recorded rather than quietly
ticked, because "already done" and "not done" look identical in a progress bar.

## Task 1 — the script exists now

| file | what |
|---|---|
| `migrations/104_bank_details_get_a_ciphertext_column.sql` | three nullable columns + a rotation index |
| `shared/crypto/envelope.ts` | AES-256-GCM seal/open, key parsing, AAD |
| `shared/crypto/tests/envelope.test.ts` | 20 tests |
| `scripts/encrypt-payout-details.ts` | the script 073 has cited since it was written |
| `features/payments/details/tests/encryption.test.ts` | 5 tests, real Postgres, rolled back |

**The envelope**: `v1.<key_id>.<iv_b64>.<tag_b64>.<ct_b64>`. Fresh 12-byte IV per
value, GCM tag alongside, version prefix so a future cipher is a parse and not a
guess. Base64's alphabet has no `.`, so the separator cannot collide.

**AAD is `<details.id>:<column>`.** A ciphertext moved to another customer's row,
or from the routing column to the account column, **fails authentication** rather
than decrypting into the wrong life. Pinned by a database test that moves a real
sealed value between two real rows.

**`encryption_key_id` is a column as well as an envelope field**, on purpose:
rotation needs `WHERE encryption_key_id = $1` to FIND the stale rows, and parsing
18 envelopes in JavaScript is not a predicate. Encryption that cannot be rotated
is a future incident.

### The two refusals that matter more than the cipher

**It will not run without `PAYOUT_ENCRYPTION_KEY`** — so a database can be
migrated by someone who does not hold the key. That was 073's design and it is
kept.

**It will not call an empty run a success.** Dev holds 16 payouts and NOT ONE
bank number — every one is ECHECK or DORADO_ACCOUNT — so the happy path here
processes zero rows on the only database it will ever be tested against. That is
the exact shape this codebase has shipped six times (D95, D99, D108, D115, D157,
D176). Zero candidates exits **non-zero** unless `--allow-empty` says the
operator meant it.

Both are proven by `--self-test`: 6 cases, planted violations all seen, and the
gate now runs it (`lint:script-guards` went from 20 self-tests to 22).

### A real defect found by running it

Jacob added `PAYOUT_ENCRYPTION_KEY` to `.env` and it **decoded to 48 bytes**.
AES-256 needs exactly 32. The script refused it with the generator command in the
error. The guard's first encounter with a real mistake was a catch, not a
theory.

## Task 2 — measured, and the numbers in three documents were wrong

`scripts/audit-plaintext-secrets.ts` asks the database instead of repeating the
number. Production, read-only, 2026-08-29:

| table.column | rows | customers |
|---|---|---|
| `exchange.payouts.routing_number` | 14 | 9 |
| `exchange.payouts.account_number` | 14 | 9 |
| `payments.details.routing_number` | 10 | 8 |
| `payments.details.account_number` | 10 | 8 |

**The count was never 18.** Of 62 payouts (not 61): ACH has 11 rows of which
**7** carry numbers, WIRE has 8 of which **7** do. The old "10 ACH and 8 WIRE"
counted the ROWS OF THOSE METHODS, not the ones holding secrets — 4 ACH and 1
WIRE payout carry none. CLAUDE.md said "fourteen" in its heading and 10+8 in its
body and had contradicted itself for months. **24 rows across two tables** was
always right even while both halves were wrong.

All 56 of production's `payments.details` rows are January residue: not one
shares an id with an `exchange.payouts` row. 071 removes them and has never run
there.

**Why 72% and not 100%**: the audit exists and the second copy is measured and
has a removal path (071), but **nothing has actually been encrypted or cleared**.
That is production work in Jacob's sequence.

## The honest gap in the testing

The cipher has 20 tests, the columns have 5 against real Postgres, and the
refusals have 6 self-test cases. **What is NOT tested is the script's UPDATE loop
against rows that actually hold plaintext**, because dev has none and creating
some would mean writing synthetic bank numbers into `exchange.payouts` on a
connection the script commits from — which is precisely the shape
`audit:test-leaks` exists to catch. Stated rather than papered over: that path
first executes on production, under `--commit`, after a `pg_dump`, and `--verify`
is there to check its work.

## What is deliberately NOT written

**The migration that clears the plaintext.** Write, verify, and only then clear —
and clearing `exchange.payouts` is a destructive change to `exchange`, needing
the `allow-destructive:` marker, a stated backup and Jacob. This lane adds
ciphertext and removes nothing.
