# The documentation pass (ruling 86)

Jacob, 2026-09-07: *"Yeah def a major docs pass needed. Should also clear docs
that we no longer need."*

The documentation described a codebase that no longer exists. `CLAUDE.md` was
953 lines of migration-era war diary naming `features/`, `api/legacy/`,
`shared/wire/`, dual-writes and `*_SOURCE` switches — none of which survive.
`FOLLOWUPS.md` was 16,356 lines with the standing rulings buried inside it.
`docs/waves/` held 32 files, most of them finished lane logs.

## What the pass produced

| file | before | after | what it is now |
|---|---|---|---|
| `CLAUDE.md` | 953 | 353 | what a new agent reads first: the business, the one rule, the layout, the request flow, the lints, the gate, production day, the rulings pointer, where things stand |
| `docs/rulings.md` | — | 353 | every standing ruling 1-96, numbered, grouped by theme. The law. |
| `FOLLOWUPS.md` | 16,356 | 167 | open items only, with a pointer to the archive |
| `docs/history/FOLLOWUPS-2026-09-07.md` | — | 16,356 | the old file verbatim, moved with `git mv` so blame survives |
| `docs/history/README.md` | — | new | the index of everything moved |
| `docs/waves/docs-pass.md` | — | this file | what moved, what was corrected, what could not be verified |

## Moves

Everything below moved with `git mv`. Nothing was deleted.

### Root

| from | to | why |
|---|---|---|
| `FOLLOWUPS.md` | `docs/history/FOLLOWUPS-2026-09-07.md` | the running record; its open items and its rulings were extracted |
| `PROMOTION.md` | `docs/history/PROMOTION.md` | the `*_SOURCE` promotion runbook. Every switch is deleted, and ruling 82 replaced its production sequence. |
| `WAVES.md` | `docs/history/WAVES.md` | the progress board. Its percentages stopped tracking reality. |
| `MERGE-NOTES-ds-update.md` | `docs/history/MERGE-NOTES-ds-update.md` | merged |
| `.claude/skills/migrate-feature-schema/SKILL.md` | `docs/history/migrate-feature-schema-SKILL.md` | the skill migrated one feature at a time from `exchange` to the domain schemas. `grep` finds no `exchange` table in `api/src` at all, so the skill has no subject. |

### `docs/waves/` to `docs/history/waves/`

`boundary-feature.md` · `checkout-items-shape-changes.md` ·
`contracts-shape-changes.md` · `handoff-2026-09-06.md` · `packing-list-nan.md` ·
`phase10-design-system.md` · `phase5-fast-gate.md` · `phase7-money-at-rest.md` ·
`prettier.md` · `pricing.md` · `production-day-fixes.md` · `profit-sql.md` ·
`purge.md` · `seams.md` · `views.md` · `wave-5b.md` · `write-pivot.md`

Seventeen finished lane logs. `write-pivot.md` matters most of the seventeen:
it holds the covenant ledger taken before `exchange` stopped being written, and
that ledger cannot be re-derived.

### Kept in `docs/waves/`

Runbooks and live designs: `production-chain.md` (the production day),
`uat-rehearsal.md`, `backfill-honesty.md`, `domains.md`, `nextjs-factor.md`,
`metal-name.md`, `products-are-flair.md`, `orders-pass-2.md`,
`no-dictionaries.md`, `stripe-22.md`, `e2e-2026-09-07.md`, `local-postgres.md`,
`test-suite-redesign.md`, `rest-routes.md`, `handoff-2026-09-07.md`.

`docs/reviews/` and `docs/model/lots.md` were not touched.

## Deleted

Nothing. No file in `docs/` was empty and no two files had the same content.

## `AGENTS.md`

Unchanged. It names no repository path, so nothing in it went stale.

## `.claude/skills/verify-changes/SKILL.md`

Corrected, not moved. It listed `verify:parity` and `diff` as commands to run;
neither script exists any more. It also described the test runner as
`node --test` and referenced a `*_SOURCE` switch test. Those four lines were
rewritten to the current commands; the rest of the skill is accurate.

## Claims that were checked and dropped

Each of these was in `CLAUDE.md` and is false today.

| claim | what is true |
|---|---|
| `features/*` on either side | `api/src/db/<schema>` and `api/src/domains/<domain>`; `frontend/app/<route>/_src_/` and `frontend/shared/` |
| `api/legacy/`, `shared/wire/`, every `*_SOURCE` switch, every dual-write | gone |
| `api/db.ts` holds the NUMERIC/BIGINT parsers | `api/src/pool.ts` does |
| `features/orders/read.service.ts`, `compose.ts`, `features/products/service.ts`, `features/payouts` | `domains/orders/read.ts`; no `compose.ts` exists; `domains/catalog/products/service.ts`; payouts dissolved into payments under ruling 74 |
| `scripts/lib/feature-map.mjs` | `scripts/lib/feature-map.ts` |
| "the one remaining exchange read on a live path" — `exchange.addresses.name` to `recipient_name` | closed. Migration 127 added `recipient_name` to `places.user_addresses` and backfilled it. `grep` finds no `exchange` table anywhere in `api/src`. |
| the `auth` to `exchange` mirror triggers still run | migration 133 dropped all four |
| eighteen domain schemas including `auctions` | genesis creates 17; `auctions` was dropped by migration 067; `core` never existed outside the January plan |
| `verify:parity` | the script does not exist. Both sides of every old table pair are frozen, so it had nothing left to compare. |
| `pnpm check` is 27 members in five groups including a frontend group | 44 members, 28 under `--fast`. There is no frontend group: the gate never runs the frontend's typecheck, test or build. |
| `check:serial` is the same members as `check` | it has fallen behind and runs about half of them |
| the test preflight derives `test_<branch>` from the git branch | it does not. It refuses anything not loopback, refuses a database whose name does not start with `test`, and creates a missing `test*` database from `test` as a template. `TEST_DATABASE_URL` is what points a lane at its own copy. |
| `-- baseline: 002-049` | `002-134` |
| `docs/model/` was deleted | `docs/model/lots.md` exists and is a live proposal |
| the `migrate-feature-schema` skill's subject | the migration is finished |
| the two corrupt-`type` products are "not reachable today" | they are reachable on the bid storefront. The whole audit paragraph left `CLAUDE.md`; the fact is an open item in `FOLLOWUPS.md`. |

Two claims were kept but softened because their measurement is old and the
ruling-82 reset makes the number irrelevant: how many schemas production lacks,
and the exact plaintext-payout count. `FOLLOWUPS.md` records the last measured
figures with their date and says to re-measure.

## Known stale citations left in place

These name a doc that moved. They are code, not documentation, so this pass did
not edit them. `docs/history/README.md` maps every old path to its new one.

- `api/scripts/verify-backfill.mjs` cites `docs/waves/production-day-fixes.md`
- `api/migrations/128_the_handover_lives_with_the_fulfillment.sql` cites
  `docs/waves/boundary-feature.md`
- `api/src/domains/documents/pdfs/tests/service.test.ts` cites
  `docs/waves/packing-list-nan.md`
- `frontend/scripts/lint-call-site-styling.mjs` prints "ruling 20 in
  FOLLOWUPS.md"; `frontend/scripts/lint-list-fanout.mjs` prints "D111 in
  FOLLOWUPS.md". The rulings are in `docs/rulings.md` now and D111 is in the
  archive.
- `docs/waves/no-dictionaries.md` and `docs/reviews/*.md` cite
  `docs/waves/pricing.md`, `profit-sql.md`, `boundary-feature.md` and
  `packing-list-nan.md`.

## The gate

`pnpm check:fast` passes with one failure, `figma:inventory`, which has 12
standing findings and fails on every branch. `lint:script-guards` reads only
script source under `api/scripts` and `frontend/scripts` — no markdown — so a
documentation pass cannot break it.
