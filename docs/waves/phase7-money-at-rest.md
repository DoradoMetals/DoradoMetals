# Phase 7 (PROPOSED) — money at rest

Owner: unassigned. Brief by the coordinator 2026-08-29 under ruling 39.
**Not approved yet.**

```
1. encrypt-payout-details.mjs, which was cited and never written  ░░░░░░░░░░░░░░░░░░    0%
2. The second copy in payments.details            ░░░░░░░░░░░░░░░░░░    0%
3. Read paths: last-4 everywhere, full behind admin  ░░░░░░░░░░░░░░░░░░    0%
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
