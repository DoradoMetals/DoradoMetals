# Waves

```
OVERALL   ████████████████░░░░░░░░░░░░░░░░░░░░   ~45%
```

| | phase | | |
|---|---|---|---|
| ✅ | **shipped** `0a201bc0` → `af8bc790` | `██████████████████` | landed |
| 🔄 | **phase 1** the write pivot, and the instruments | `███████████████░░░` ~81% | three lanes |
| ⬜ | **phase 2** checkout, then payments | `░░░░░░░░░░░░░░░░░░` ~0% | queued |
| 🔄 | **phase 3** one home for every type | `███████████████░░░` ~80% | in flight |
| ⬜ | **phase 4** production | `░░░░░░░░░░░░░░░░░░` ~0% | Jacob's |
| ⬜ | **phase 5** the verification loop gets fast | `░░░░░░░░░░░░░░░░░░` ~0% | needs PG16 |
| ✅ | **phase 6** the schema enforces what exchange did | `██████████████████` ~100% | landed |
| 🔄 | **phase 7** money at rest | `███████████████░░░` ~85% | rest is Jacob's |
| 🔄 | **phase 8** the silence problem | `████████░░░░░░░░░░` ~44% | in flight |
| 🔄 | **phase 9** checkout, properly | `██████████████░░░░` ~80% | reopen is Jacob's |
| 🔄 | **phase 10** component library and theming | `███████░░░░░░░░░░░` ~40% | screens not drawn |

## Phase 1 — the write pivot

`docs/waves/write-pivot.md` · `instruments.md` · `seams.md`

```
1. The covenant ledger, run BEFORE the switch  ██████████████████  100%
2. The five missing native statements       ██████████████████  100%
3. Switch the writes to native, feature by feature  ░░░░░░░░░░░░░░░░░░    0%
4. Delete api/legacy/ and the dual machinery  ░░░░░░░░░░░░░░░░░░    0%
```

```
1. Type coverage for scripts/ (D157)        ██████████████░░░░   75%
2. The 28 remaining .test.js files          ██████████████████  100%
3. ComposedOrder probe (D159, report only)  ██████████████████  100%
4. The meta-guard's missing half (D5)       ██████████████████  100%
```

```
1. SEAM 2 - exchange.users, the inverted direction  ██████████████████  100%
2. The remaining native gaps                ██████████████████  100%
3. SEAM 1 - exchange.payouts, a reachable destination  ██████████████████  100%
4. SEAM 3 - purgeCancelled, write-up only   ██████████████████  100%
```

## Phase 2 — the last two features

Two `*_SOURCE` switches left: `CHECKOUT_SOURCE`, `PAYMENTS_SOURCE`.

```
1. Checkout: overhaul, then pivot its reads ░░░░░░░░░░░░░░░░░░    0%
2. Payments: pivot, slowly                  ░░░░░░░░░░░░░░░░░░    0%
```

## Phase 3 — one home for every type

`docs/waves/phase3-api.md` · `phase3-frontend.md`

```
A0. Executor: 37 declarations become one    ██████████████████  100%
A1. API: 8 boundary-crossing types (was '118')  █████████████░░░░░   70%
A2. API: single-file types stop exporting   ██████████████░░░░   80%
A3. API: input/patch shapes into contracts  ███████░░░░░░░░░░░   40%
A4. lint: a type has exactly one home       ██████████████████  100%
```

```
1. Census: DATA or UI, asked per declaration  ██████████████████  100%
2. The zod schemas                          ██████████████████  100%
3. Data types that duplicate a contract     ██████████████████  100%
4. Request bodies into the contracts        ██████░░░░░░░░░░░░   33%
5. Single-file types stop exporting         ██████████████████  100%
```

## Phase 4 — production (Jacob's)

Prod holds 10 of 18 schemas; missing `products`, `organizations`, `metals`,
`spots`, `media`, `leads`, `rates`, `reviews`.

```
1. pg_dump production                       ░░░░░░░░░░░░░░░░░░    0%
2. Migrate production (most of genesis)     ░░░░░░░░░░░░░░░░░░    0%
3. Backfill                                 ░░░░░░░░░░░░░░░░░░    0%
4. verify:parity + compare:databases        ░░░░░░░░░░░░░░░░░░    0%
5. Merge                                    ░░░░░░░░░░░░░░░░░░    0%
```

## Phase 5 — the verification loop gets fast

`docs/waves/phase5-fast-gate.md`. Gate is 10–13 min; 153 tests over 10s.

```
1. A local PostgreSQL 16 for the test suite  ░░░░░░░░░░░░░░░░░░    0%
2. Shorten the serialized chain             ░░░░░░░░░░░░░░░░░░    0%
3. Parallelise the independent gate members  ░░░░░░░░░░░░░░░░░░    0%
```

## Phase 6 — the schema enforces what exchange did

`docs/waves/phase6-constraints.md`. 21 accepted, 18 fixed, gated.

```
1. audit:constraints gets an ACCEPTED map   ██████████████████  100%
2. The 27 NOT NULLs, walked once            ██████████████████  100%
3. The unique indexes: real gaps only       ██████████████████  100%
4. audit:constraints joins pnpm check       ██████████████████  100%
```

## Phase 7 — money at rest

`docs/waves/phase7-money-at-rest.md`. 24 plaintext rows, two tables — measured,
not cited: 14 payouts (7 ACH + 7 WIRE, 9 customers) and 10 `payments.details`
residue rows (8 customers). The old "10 ACH + 8 WIRE" counted rows of those
methods, not rows holding numbers.

```
1. encrypt-payout-details.mjs, which was cited and never written  ██████████████████  100%
2. The second copy in payments.details      █████████████░░░░░   72%
3. Read paths: last-4 everywhere, full behind admin  ██████████████████  100%
```

## Phase 8 — the silence problem

Runtime silences: zero-row UPDATEs, unhandled mutation failures, skipping
backfills. Gate members are already guarded (D185).

```
1. rowCount assertions where zero is wrong  ████████████████░░   88%
2. Error paths that reach Sentry            ░░░░░░░░░░░░░░░░░░    0%
3. The $126.48 webhook thread               ░░░░░░░░░░░░░░░░░░    0%
```

`audit:silent-mutations` measures task 1: **23 discarded results, 1
unobservable**, each resolved through the caller's own imports. The remaining
35% is an ACCEPTED map (`tax.accrue` is correct by design) and then fixing the
call sites — the clearest being `shipping/shipments/service.ts:417`, whose own
comment says the native return is dropped "because exchange is still
authoritative", which is the assumption ruling 36 retires.

## Phase 9 — checkout, properly

`docs/waves/phase9-checkout.md`. Create-then-charge: built, tested, and closed
behind the still-admin-only route.

```
1. Create-then-charge ordering              ██████████████████  100%
2. The cart as honest device-sync           ██████░░░░░░░░░░░░   33%
```

The order exists before the money moves; the intent is verified (and its amount
server-set) where it used to be trusted; the webhook advances Pending →
Preparing in both schemas; `reconcile:payments` sweeps missed webhooks (the
cron runs the no-money half; cancel-and-refund stays behind `--commit` and a
human); an abandoned checkout is superseded on retry rather than stranded; the
$10 floor is dead (D199); and the metal-resolver bug that 422ed every
storefront order is fixed. **Reopening `create_sales_order` is Jacob's
one-word change** (`requireAdmin` → `requireUser`); AdminStripeForm's
reordering deliberately did not ride along.

## Phase 10 — component library and theming

`docs/waves/phase10-design-system.md`. 67 components, 122 importers, 7 inputs.

```
1. Inventory: what exists and who uses it   ██████████████████  100%
2. The Figma library, read                  ██████████████░░░░   75%
3. Collapse the parallel families           ░░░░░░░░░░░░░░░░░░    0%
4. The new sell/checkout form               ░░░░░░░░░░░░░░░░░░    0%
```

## Needs Jacob

- **`sudo apt install -y postgresql-16`** — ONE COMMAND, and it unblocks phase 5
  entirely. `postgresql-client-16` is installed; the SERVER is not, so there is
  no `initdb`. `sudo -n` fails here. Dev is **116 ms away** (D198) and that, not
  the code, is what makes the gate take an hour and sometimes never finish.
  Everything after the install can be done unattended — the `USE_TEST_DB=1`
  switch already exists and already refuses to point anywhere but `test`.
- **`NEXT_PUBLIC_SENTRY_AUTH_TOKEN` → `SENTRY_AUTH_TOKEN`** — rename in Railway
  FIRST, then the code. Renaming code-first makes source-map upload stop
  authenticating silently. Verified it has NOT leaked: 0 occurrences of the
  token in `.next/static` or anywhere in the build (D192).
- **Should the API have Sentry?** It has no error reporting of any kind. The
  seam is built (`shared/observability/report.ts`) and five money-adjacent paths
  call it; attaching a reporter is now one file. Adding the dependency is a
  runtime agent in the process that handles money — your call (D191).
- **The $10 Stripe floor** — `Math.max(rawAmount, 1000)` would overcharge an
  order whose real balance is under $10. Production says it has NEVER fired
  (25 intents, zero paid at 1000), so it is latent. The fix needs a decision
  about how a credit-covered order settles without a card, which is phase 9
  (D199).
- **The forged-invoice path** — `sendPricedEmail` renders `req.body` into the
  invoice PDF with nothing re-read from the database (D193).
- **Upload keys are client-supplied and not namespaced** — production images are
  keyed `/test/IMG_6698.jpeg`, so two customers whose phones pick the same
  default filename get ONE storage object and two rows. The photo is evidence of
  what a customer sent in. 3 images in production, so it has not bitten (D201).
- **`exchange.scrap.purity` is `numeric(4,3)`** — two non-destructive widening
  ALTERs are written and unapplied; 8 rows already flattened, and the rounding
  favours the customer, not the business (D200).

- **Figma PNGs → `docs/design/`** — blocks phase 10 entirely.
- **`updateMethod` can't write `payments.details`** — 23502 on `user_id`. Needs a
  user-attribution decision before `PAYMENTS_SOURCE` moves.
- **Kill two orphan processes** — 4-day `next dev`, 22h bash holding 3 dev
  connections. My kills are sandbox-blocked.
- **Stray dev order `9ef2d27e`** — delete with its 2 items + scrap row, or leave.
  (Not among the 27 removed in `cdf267e0`; it has an `exchange` row.)
- **`verify:backfill` red, 46 differences** — 047 is fixed (`ecb8b11c`) and 27
  leaked test orders are gone (`cdf267e0`). What is left is pre-existing drift,
  itemised in D186. The live one: ~12 orders whose `spots_locked` is `t` in dev
  and `f` from a rebuild. Also `audit:test-leaks` is not in `pnpm check`, which
  is why eight runs' worth of leaks accumulated unseen.
- **T&C need a lawyer** — the offers purge removed both deemed-acceptance clauses
  and the "Rejecting Our Offer" section; clause 177 promises $50,000 insurance
  where migration 097 sets 10,000.
- **Production backfill can't repair January rows** — 031 is
  `ON CONFLICT DO NOTHING`; 47 orders and 62 items already exist there.

## Maintenance

`node scripts/waves.mjs` regenerates bars from `docs/waves/*.md`. Task names must
match byte-for-byte. One writer per file. Findings live in `FOLLOWUPS.md`.
