# Waves

```
OVERALL   ████████████████░░░░░░░░░░░░░░░░░░░░   ~45%
```

| | phase | | |
|---|---|---|---|
| ✅ | **shipped** `0a201bc0` → `af8bc790` | `██████████████████` | landed |
| 🔄 | **phase 1** the write pivot, and the instruments | `███████████████░░░` ~81% | three lanes |
| ⬜ | **phase 2** checkout, then payments | `░░░░░░░░░░░░░░░░░░` ~0% | queued |
| 🔄 | **phase 3** one home for every type | `█████████████░░░░░` ~72% | in flight |
| ⬜ | **phase 4** production | `░░░░░░░░░░░░░░░░░░` ~0% | Jacob's |
| ⬜ | **phase 5** the verification loop gets fast | `░░░░░░░░░░░░░░░░░░` ~0% | needs PG16 |
| ✅ | **phase 6** the schema enforces what exchange did | `██████████████████` ~100% | landed |
| ⬜ | **phase 7** money at rest | `░░░░░░░░░░░░░░░░░░` ~0% | ready |
| ⬜ | **phase 8** the silence problem | `░░░░░░░░░░░░░░░░░░` ~0% | ready |
| ⬜ | **phase 9** checkout, properly | `░░░░░░░░░░░░░░░░░░` ~0% | needs decisions |
| 🔄 | **phase 10** component library and theming | `███░░░░░░░░░░░░░░░` ~19% | blocked on Figma |

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
A4. lint: a type has exactly one home       ░░░░░░░░░░░░░░░░░░    0%
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

`docs/waves/phase7-money-at-rest.md`. 24 plaintext rows, two tables.

```
1. encrypt-payout-details.mjs, which was cited and never written  ░░░░░░░░░░░░░░░░░░    0%
2. The second copy in payments.details      ░░░░░░░░░░░░░░░░░░    0%
3. Read paths: last-4 everywhere, full behind admin  ░░░░░░░░░░░░░░░░░░    0%
```

## Phase 8 — the silence problem

Runtime silences: zero-row UPDATEs, unhandled mutation failures, skipping
backfills. Gate members are already guarded (D185).

```
1. rowCount assertions where zero is wrong  ░░░░░░░░░░░░░░░░░░    0%
2. Error paths that reach Sentry            ░░░░░░░░░░░░░░░░░░    0%
3. The $126.48 webhook thread               ░░░░░░░░░░░░░░░░░░    0%
```

## Phase 9 — checkout, properly

Create-then-charge. Needs a pending state and a reconciliation path.

```
1. Create-then-charge ordering              ░░░░░░░░░░░░░░░░░░    0%
2. The cart as honest device-sync           ░░░░░░░░░░░░░░░░░░    0%
```

## Phase 10 — component library and theming

`docs/waves/phase10-design-system.md`. 67 components, 122 importers, 7 inputs.

```
1. Inventory: what exists and who uses it   ██████████████░░░░   75%
2. The Figma library, read                  ░░░░░░░░░░░░░░░░░░    0%
3. Collapse the parallel families           ░░░░░░░░░░░░░░░░░░    0%
4. The new sell/checkout form               ░░░░░░░░░░░░░░░░░░    0%
```

## Needs Jacob

- **Figma PNGs → `docs/design/`** — blocks phase 10 entirely.
- **`updateMethod` can't write `payments.details`** — 23502 on `user_id`. Needs a
  user-attribution decision before `PAYMENTS_SOURCE` moves.
- **Kill two orphan processes** — 4-day `next dev`, 22h bash holding 3 dev
  connections. My kills are sandbox-blocked.
- **Stray dev order `9ef2d27e`** — delete with its 2 items + scrap row, or leave.
- **`verify:backfill` red since 098** — 047 seeds `'SHIPMENT'::text` into an enum.
  Fixable, but edits an applied migration.
- **T&C need a lawyer** — the offers purge removed both deemed-acceptance clauses
  and the "Rejecting Our Offer" section; clause 177 promises $50,000 insurance
  where migration 097 sets 10,000.
- **Production backfill can't repair January rows** — 031 is
  `ON CONFLICT DO NOTHING`; 47 orders and 62 items already exist there.

## Maintenance

`node scripts/waves.mjs` regenerates bars from `docs/waves/*.md`. Task names must
match byte-for-byte. One writer per file. Findings live in `FOLLOWUPS.md`.
