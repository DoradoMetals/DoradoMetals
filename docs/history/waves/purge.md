# Purge lane — dead code, scripts, markdown and notes

Jacob (verbatim): *"lets just have a dead code/scripts/markdown/notes purge.
Anything that can go should. Keep it focused on the api though."* and *"NO way
we need all of those [scripts]."*

Scope: `api/**`, `api/package.json` scripts, `scripts/check.mjs` members that
lose their subject, `PROMOTION.md`, `docs/waves/*.md`. Not `frontend/**`, not
`packages/**`, not `api/migrations/**`, not `FOLLOWUPS.md` / `CLAUDE.md` /
`AGENTS.md`.

## Totals

| | before | after |
|---|---|---|
| `api/**` lines (excl. `migrations/`) | 68,325 | 65,897 |
| `api/scripts/*` (top level) | 59 | 47 |
| `api/scripts/lib/*` | 5 | 5 |
| `lint:script-guards` census (incl. `frontend/scripts`) | 68 | 56 |
| `api/package.json` script entries | 103 | 89 |
| `docs/waves/*.md` | 41 | 13 (12 kept + this file) |

`git diff --shortstat`: **71 files changed, 3 insertions(+), 10,421
deletions(-)** — 56 files deleted, 15 modified. The three insertions are
single-line rewrites in `vitest.config.ts` and `lint-script-guards.mjs`.

## Deleted

### Scripts (12 api + 1 root, 1,846 lines)

| path | lines | reason |
|---|---|---|
| `api/scripts/verify-parity.mjs` | 210 | compares two frozen tables; `exchange` stops receiving writes (ruling 36) so its green means nothing |
| `api/scripts/clean-dual-run-orphans.mjs` | 106 | eleven hardcoded UUIDs from one 2026 dual-run incident; the dual era is deleted |
| `api/scripts/clean-leaked-test-orders.mjs` | 78 | not in `package.json`; its ORPHAN predicate ("no `exchange` counterpart") now matches every native order |
| `api/scripts/compare-tables.mjs` | 96 | not in `package.json`; `exchange`↔new pair viewer, migration-era. `compare:databases` is the asserting version and stays |
| `api/scripts/audit-guards.mjs` | 76 | asks each backfill guard for new-schema rows `exchange` lacks — under ruling 36 that is every new row, by design |
| `api/scripts/audit-item-price.mjs` | 144 | one-shot answer to ruling 34 (D116), keyed on `exchange.purchase_order_items` |
| `api/scripts/audit-table-owners.mjs` | 146 | its whole ACCEPTED map cites `repo.mirror.ts` and the dual writes, all deleted in D212 |
| `api/scripts/audit-vacuous-tests.mjs` | 161 | ungated test-quality report; no reference in `check.mjs`, CLAUDE.md or any script |
| `api/scripts/audit-slow-tests.mjs` | 172 | same; vitest 4 reports per-test duration itself |
| `api/scripts/plan-migration.mjs` | 123 | reads `api/features/`, a directory the restructure removed — already broken |
| `api/scripts/generate-feature.mjs` | 186 | scaffolds the pre-restructure feature layout with a `--legacy` pair, and emits SQL comments (ruling 54) |
| `api/scripts/dump-stripe-reconciliation.mjs` | 141 | one-shot CSV reader that wrote `055_seed_stripe_reconciliation.sql`; 055 exists and migrations are frozen |
| `scripts/waves.mjs` | 207 | wave-tracker generator; 29 of its 41 input lane files are gone with this pass |

### Superseded test harness (2 files, 372 lines)

| path | lines | reason |
|---|---|---|
| `api/sandbox/fedex.sandbox.js` | 173 | superseded by `tests-external/fedex.test.ts` (the lane-6 TypeScript conversion), which covers env selection, rate quote, tracking and label create+void |
| `api/sandbox/stripe.sandbox.js` | 199 | superseded by `tests-external/stripe.test.ts` — idempotency, amount update, cancel, unknown-id, webhook signature |

These were the last two `.js` files under `api/`. `test:sandbox` and the two
`sandbox/**` excludes in `vitest.config.ts` went with them.

### One-off working files (4 files, 142 lines)

`api/.scratch/codemod_actor.py`, `codemod_rollback.py`, `cols.ts`, `q.ts` —
single-use codemods and ad-hoc query helpers from earlier waves, referenced by
nothing.

### Dead modules and orphans (7 files, 93 lines)

| path | lines | reason |
|---|---|---|
| `api/shared/http/patch-body.ts` | 38 | no importer; streamline-b retired its last consumer |
| `api/db/fulfillments/methods/sql/update.sql` | 9 | `update()` builds its statement with `buildUpdate` |
| `api/db/products/sql/get_admin_all.sql` | 10 | `listAdmin` builds `get_admin` with a predicate |
| `api/db/orders/sql/directions.sql` | 3 | only reader was `directionsById` (below) |
| `api/db/orders/sql/owners.sql` | 3 | only reader was `ownersById` (below) |
| `api/db/places/user-addresses/sql/get_by_address.sql` | 3 | only reader was `getByAddress` (below) |
| `api/domain/media/emails/templates/salesOrderPlaced.raw.html` | 27 | only renderer was `renderSalesOrderPlacedEmail` — see the finding below |

### Dead exports (14 symbols, 102 lines across 12 files)

Found by an import-graph walk over `git ls-files 'api/**/*.ts'` resolving the
`#db`/`#domain`/`#shared`/`#providers`/`#transport` subpaths, plus an
identifier scan for every exported name across the repo. Each of these had
exactly one occurrence in the tree — its own declaration.

`db/orders/repo.ts` `directionsById`, `ownersById` ·
`db/places/user-addresses/repo.ts` `getByAddress` ·
`domain/fulfillments/rules.ts` `CATEGORY_OF_CHOICES` ·
`domain/media/emails/utils/renderEmail.ts` `renderSalesOrderPlacedEmail` ·
`domain/media/images/service.ts` `listForUser` ·
`domain/media/pdfs/render/format.ts` `getItemPrice` ·
`domain/orders/rules.ts` `assertTotals` ·
`domain/payments/service.ts` `capturePaymentIntent` ·
`domain/places/addresses/service.ts` `inBook`, `recordValidation` ·
`domain/shipping/operations/service.ts` `voidPickup` ·
`domain/shipping/shipments/service.ts` `getManyById` ·
`providers/payment/stripe.ts` `captureIntent`

`getByAddress` and `captureIntent` are cascade removals — they became dead when
`inBook` and `capturePaymentIntent` went, found by re-running the scan.

### Markdown (30 files, 7,796 lines)

`api/FOLLOWUPS.md` (14 lines) — an orphaned copy of root FOLLOWUPS item 8,
about legacy code D212 deleted; its text ("dual-writes continue so exchange
stays a level shadow") contradicts the current tree. Nothing cites it.

29 of 41 `docs/waves/*.md`: every lane file not cited by `CLAUDE.md`,
`FOLLOWUPS.md`, a migration, or a surviving script or test.

`anonymous-checkout` `api-journeys` `checkout-feature` `comment-purge`
`contracts-entities` `fulfillments-feature` `instruments` `orders-feature`
`orders-shape-changes` `overnight-lane-a` `overnight-lane-b` `overnight-lane-c`
`overnight-lane-d` `patch-surface` `payments-feature` `phase3-api`
`phase3-frontend` `phase6-constraints` `phase9-checkout` `places-feature`
`products-feature` `small-features` `streamline-a-shape-changes`
`streamline-b-shape-changes` `wave-3.5` `wave-4-lane-a` `wave-4-lane-b`
`wave-5a` `wave-5c`

## Kept — the close calls

| kept | why |
|---|---|
| `PROMOTION.md` | the brief's condition was "if CLAUDE.md's note is its only reference". It is not: `FOLLOWUPS.md` cites it twice and `api/.env.example` once |
| `verify-genesis-production.mjs` | not named in CLAUDE.md's sequence, but it is the only thing that compares genesis against production's shape read-only — the exact question on the day eight missing schemas get created |
| `dump-seed.mjs` | live loop, not a one-shot: `verify:backfill` runs `047_seed_reference_data.sql` and compares its rows against dev, so new reference data on dev means re-dumping the seed. Same relationship `dump:schema` has to genesis |
| `reconcile-payments.ts` | the repair half of a live open thread (production's $126.48 of unrecorded Stripe captures), and the only caller of `sweepAbandoned` — `sweepSettledIntents` runs on cron, `sweepAbandoned` does not |
| `audit-frontend-nullability.ts` | CLAUDE.md names it, which is a hard keep. It reads frontend zod schemas, so it will need re-pointing when the frontend is replaced |
| `api/tests/cassettes/README.md` | nothing reads it, but it is the only map of which of the eleven cassettes covers which scenario, and `test:record` stays |
| `docs/waves/phase7-money-at-rest.md` | cited only by `WAVES.md`, so the rule says delete — but it is the runbook for the one procedure on this project that is unfinished and destructive (071 → 073 → `encrypt:payouts`) |
| `docs/waves/phase10-design-system.md` | cited by `packages/theme/README.md`, which is outside this lane's scope |
| the 43 remaining "unused exports" | every one is used inside its own file; only the `export` keyword is surplus. Deleting bodies was the purge; dropping export keywords is churn with a real chance of tripping `lint:type-homes` or `lint:contracts-derived`. Listed in the findings below |

## `api/package.json`

14 entries removed, all of whose script files died: `verify:parity`, `plan`,
`audit:item-price`, `audit:guards`, `clean:dual-orphans`,
`audit:vacuous-tests` (+ `:self-test`), `audit:slow-tests` (+ `:self-test`),
`audit:table-owners`, `dump:stripe`, `generate:feature`, `test:sandbox`, and
`typecheck:sweep` — whose only subject was the two `sandbox/*.js` files.

## `scripts/check.mjs`

**Unchanged.** Every one of its members survived; nothing it runs lost its
subject. The gate is the constraint the whole pass was built around.

## `lint-script-guards.mjs`

Its expectations follow the surviving scripts:

- nine `EXCUSED` entries removed, one for each deleted script. The lint's own
  `STALE-EXCUSE` rule fires on an excuse that outlives its subject, so leaving
  them would have failed the gate — the pin works both ways, by design.
- `audit-slow-tests.mjs` removed from `NOT_EXECUTED_HERE`.
- `SUITE_LIBRARY_FLOOR` 2 → 1. Only `audit-test-leaks.ts` reads the suite
  invocation from `package.json` now; `audit-slow-tests.mjs` was the other.
  Lowered to the honest count, not to hide the deletion — at 2 it would have
  reported "the library has lost its callers", which would have been true.
- `SCRIPT_FLOOR` left at 50 against a census of 56 (was 68). Still fires if the
  walk breaks.
- `reconcile-payments.ts`'s excuse cited `domain/orders/tests/reconcile.test.ts`,
  which does not exist and never did. Corrected to
  `domain/payments/tests/sweeps.test.ts`, which does.

## Verification

| check | result |
|---|---|
| `pnpm check:fast` | PASS except `figma:inventory` (9 findings, all `packages/components`, pre-existing and Jacob's) |
| `api:test` | 221 files, 1312 passed, 1 skipped, 0 failed |
| `api:typecheck` | clean |
| `pnpm --filter @dorado/api lint:script-guards` | 56 scripts, 56 parse, 29 self-tests run, 1 deferred, 26 excused |
| `lint:script-guards:self-test` | 15 cases, all planted violations seen |
| `pnpm --filter @dorado/client typecheck` | clean |
| `pnpm --filter @dorado/api verify:genesis` | 49 tables, 4 views, identical to dev, committed genesis matches |

`frontend` typecheck and tests deliberately not run — Jacob, mid-lane: *"The
frontend is getting nuked anyway."* No frontend or `packages/**` file imports
anything removed here (grepped).

## Findings for Jacob

1. **The sales-order-placed email has no sender.**
   `sendOrderPlacedConfirmation` always renders
   `renderPurchaseOrderPlacedEmail`, so a customer placing a SALE gets the
   purchase-order wording. `renderSalesOrderPlacedEmail` and
   `salesOrderPlaced.raw.html` had no caller at all and were deleted with the
   rest of the dead code. This is a behaviour gap, not a purge artifact — if
   the email is wanted, `git show HEAD:api/domain/media/emails/templates/salesOrderPlaced.raw.html`
   brings the copy back.

2. **`api/.env.example` line 48** still says "the two surviving schema-source
   switches (see `PROMOTION.md`)". Both switches died in D212. Not edited —
   `.env*` is out of this lane's remit.

3. **`CLAUDE.md` line 392** — the `PROMOTION.md` "historical record" sentence.
   Left alone as instructed; flagged because `PROMOTION.md` survived this pass
   on the strength of `FOLLOWUPS.md`'s two citations, not that sentence.

4. **Six dangling doc citations**, all to deleted lane files: five in
   `WAVES.md` (whose generator `scripts/waves.mjs` is now gone, so it is a
   static document) and one comment in `frontend/features/users/types.ts`.
   `WAVES.md` was outside this lane's scope.

5. **`.claude/skills/migrate-feature-schema/SKILL.md`** invokes `verify:parity`,
   `scripts/compare-tables.mjs` and `scripts/diff-source.mjs`. The last was
   already deleted before this lane; the first two are now. The skill needs a
   pass or a retirement — it is `.claude/`, outside scope.

6. **`api/tsconfig.json` still sets `allowJs: true`** with no `.js` left under
   `api/`. Harmless, left alone.

7. **43 exports are used only inside their own file** — the `export` keyword is
   surplus on each. Not touched; see the keep table for why.
   `db/media/emails/repo.ts` `NewEmail` · `db/media/pdfs/repo.ts` `NewPdf` ·
   `db/refiners/items/repo.ts` `getForItems` · `db/refiners/orders/repo.ts`
   `NewRefinerOrder` · `domain/checkout/sweep.ts` `BATCH` ·
   `domain/fulfillments/rules.ts` `categoriesFor` ·
   `domain/media/images/service.ts` `attachUrlToImage` ·
   `domain/media/pdfs/order-inputs.ts` `packageDetailsFor` ·
   `domain/media/pdfs/render/sections.ts` `scrapItemNames` ·
   `domain/orders/rules.ts` `creditsToAccount`, `assertDeclaredMetal` ·
   `domain/payouts/constants.ts` `isPayoutMethod` ·
   `domain/products/service.ts` `getAdminProduct` ·
   `domain/refiners/service.ts` `ComposedRefiner` ·
   `domain/sales-tax/service.ts` `TaxableItem` ·
   `domain/shipping/rules.ts` `assertWeight`, `TRACKING_STAGES`,
   `awaitingHandoff` · `domain/shipping/services/service.ts`
   `insuranceCeilingFor` · `domain/spots/rules.ts` `trendOf` · plus the
   `scripts/lib/**` and `shared/**` type aliases, which are library API.
