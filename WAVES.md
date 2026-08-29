# Waves

Where the rewrite is. Bars first, descriptions below.

```
OVERALL   █████████████████████████░░░░░░░░░░░   ~70%
```

| | wave | | |
|---|---|---|---|
| ✅ | **D77–D86** conversions, wire axis retired | `██████████████████` | 100% · landed |
| ✅ | **D87/D88** unified orders surface | `██████████████████` | 100% · `0a201bc0` |
| ✅ | **wave 2** orders read pivot | `██████████████████` | 100% · `a12b76ed` |
| ✅ | **styling** dark-only, components own appearance | `██████████████████` | 100% · `9de7d283` |
| ✅ | **wave 3** the order wire slims | `██████████████████` | 100% · `2208932e` |
| 🟡 | **wave 3.5** factor, delete legacy, co-locate | `██████████░░░░░░░░` | ~58% · landed partial |
| ⬜ | **wave 4** batching, pricing, styling lane B | `░░░░░░░░░░░░░░░░░░` | 0% · queued |
| ⬜ | **wave 5** checkout proper | `░░░░░░░░░░░░░░░░░░` | 0% · queued |

## Wave 3.5 — LANDED PARTIAL, and deliberately so

Detail and decisions: `docs/waves/wave-3.5.md`.

```
1. Factor resources into their own domains  ██████████████░░░░   75%
2. Remove proven legacy read + write paths  ████████░░░░░░░░░░   45%
3. Delete code with no remaining paths      ██████████████░░░░   75%
4. Orders shapes come from contracts        ██████████████████  100%
5. Co-locate tests under tests/             ██░░░░░░░░░░░░░░░░   10%
6. Convert touched tests to TypeScript      ░░░░░░░░░░░░░░░░░░    0%
7. Write the process down                   ██████████████████  100%
```

**It stopped at seams rather than half-rewriting the money path, which is the
right call.** Three things are unfinished and each has a reason:

- **`purchase-orders/` and `sales-orders/` still exist.** Not ambiguity — NAME
  COLLISION. Both hold `repo.ts`, `compose.ts`, `read.service.ts`,
  `write.service.ts`, `service.ts`, `controller.ts`, `routes.ts`, and
  `features/orders/` already has four of those. ~2,000 lines with a real merge
  at every collision, on the money path, at ten minutes per verification cycle.
- **No legacy WRITER was removed, for any feature.** The one-way door stayed
  shut. `repo.dual.js` mirrors by re-deriving from exchange
  (`INSERT … SELECT FROM exchange.*`), so deleting the exchange half leaves the
  new rows with no source. All 29 writes need native statements; native repos
  exist for 24 of 29 (`spots_locked`, `order_total` and `purgeCancelled` are
  missing). It cannot be re-checked by `verify:parity` afterwards, so the
  ledger has to run BEFORE, not after. Legacy READS were removed, orders only.
- **Tests are not co-located or converted** (tasks 5 and 6), because they ride
  with the factoring and the factoring is not finished. Moving them now would
  move every file twice.

Carried into wave 4 below.

## Wave 4 — queued

```
A1. assemble() batching fix (D101)           ░░░░░░░░░░░░░░░░░░    0%
A2. Pricing: array in, prices out            ░░░░░░░░░░░░░░░░░░    0%
A3. D97 payout figure from the server        ░░░░░░░░░░░░░░░░░░    0%
A4. D98 credit ledger takes {op, amount}     ░░░░░░░░░░░░░░░░░░    0%
A5. Dissolve purchase-orders/ + sales-orders/ ░░░░░░░░░░░░░░░░░░   0%   (from 3.5)
A6. Co-locate tests + convert to TypeScript   ░░░░░░░░░░░░░░░░░░   0%   (from 3.5)
B1. Shadows deleted, not tokenised           ░░░░░░░░░░░░░░░░░░    0%
B2. One radio group, two components deleted  ░░░░░░░░░░░░░░░░░░    0%
B3. Orders tree typography (263 utilities)   ░░░░░░░░░░░░░░░░░░    0%
B4. The D99 state-collapse audit             ░░░░░░░░░░░░░░░░░░    0%
B5. Extract shared components; adopt existing ░░░░░░░░░░░░░░░░░░   0%
```

## Wave 5 — queued

```
1. Checkout creates unify                    ░░░░░░░░░░░░░░░░░░    0%
2. Scrap + bullion legacy layers deleted     ░░░░░░░░░░░░░░░░░░    0%
3. Shipping: carrier vocabulary off the UI   ░░░░░░░░░░░░░░░░░░    0%
```

---

# What each wave is

**Wave 3.5 — factor, delete legacy, co-locate.** Every resource gets its own
full stack: `routes.ts`, `controller.ts`, `service.ts`, `repo.ts`. The parent
mounts routes rather than declaring them, so checkout can depend on
`fulfillments/methods` without dragging in pickups, directs and the schedule.
Paths do not change — the URL and the file answer different questions. Legacy
code that has been *proven* (data migration verified, reads pivoted) is deleted
or moved to `api/legacy/`, one top-level directory so that promotion day is a
single deletion. Tests move under `tests/` and become TypeScript in the same
pass, because doing those separately moves every file three times. The goal is
that `purchase-orders/` and `sales-orders/` cease to exist: direction is a
column, not a feature.

**Wave 4 — the money and the last of the styling.** Lane A is API logic. The
batching fix comes first because it pays for everything after it: the composed
read queries the shipment and pickup inside a per-order loop, ~214 round trips
against a database 178 ms away versus 2 for the slim list, and fixing it is
worth ~500 seconds on every gate run. Then pricing becomes one module with an
array API that returns *prices*, not items — thirty items is one call, and the
caller already has the items it sent. Then the two live money defects: the
Estimated Payout figure that reads $20 high because `+` binds tighter than
`??`, and the customer credit ledger that is computed in the browser and PUT as
an absolute total with a lost-update race on $66,999. Lane B finishes the
styling: the shadows are deleted rather than tokenised, the three radio
components coalesce into one group, the orders tree's 263 remaining type
utilities go, and someone finally runs the D99 audit — selected-versus-unselected
across order rows, drawer tabs and status chips, which no contrast metric can
answer because both states are individually legible.

**Wave 5 — checkout proper.** Sized as orders-scale rather than a tidy-up. The
creates unify off the legacy routes, the scrap and bullion legacy API layers
delete after covenant verification, and the shipping mess gets addressed: the
frontend currently matches FedEx service types directly, which is the same
defect class as the wire work — the frontend should not know carrier vocabulary
at all.

## Blocked on Jacob, not on a wave

- **The production deploy order.** No migration has run against prod and no
  `pg_dump` exists. The orders read pivot has landed, so merging to `master`
  before prod is migrated *and backfilled* serves customers a January snapshot
  (`orders.orders` in prod: 60 rows, newest 2026-01-12; `exchange`: 72 orders
  through 2026-08-24). The sequence is written out in CLAUDE.md.
- **Promotion of the two remaining `*_SOURCE` switches.** One-way door.
- **The T&C legal copy** edited by the offers purge — unreviewed, and it ships
  the moment master deploys.
- **D39** — two production products carrying `E'\n\tBar'`; the fix is an UPDATE
  against production.
- **`orders.items.price`** — derived, or sometimes an admin override? Dropping
  the column is unsafe until that is counted (ruling 34).

## How this file is maintained

The coordinator owns this file. Each agent owns exactly one file under
`docs/waves/` and updates only that one — never this index, never another
agent's. Two agents editing one shared file is how two rulings were lost on
2026-08-28; the split is the fix, not bureaucracy. `FOLLOWUPS.md` is the
coordinator's alone and remains the authority for rulings and findings.
