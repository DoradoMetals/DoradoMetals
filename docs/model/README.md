# The model — what the database says the business is

Designed by Jacob on 2026-09-02, in one sitting, after the Great Purge (D212)
left the API with no legacy code and a data model that was still `exchange`
renamed with namespaces. Recorded in FOLLOWUPS.md as D213 (rulings 40–46).
This directory is the design; FOLLOWUPS.md holds the rulings and the reasons.

**Status: DESIGN. Nothing here is in a migration yet.** The continuing schema
migration targets this model from now on and does not extend the January
tables. See [migration-plan.md](migration-plan.md) for the sequence.

## Files

| File | What it decides |
| --- | --- |
| [lots.md](lots.md) | One row per physical lot; measurements as stage rows; no copies |
| [orders.md](orders.md) | Orders with a counterparty; lines link, spots freeze; refiner orders are separate orders |
| [refining.md](refining.md) | A settlement is data plus money; the pool is a ledger of credits and locks |
| [pricing.md](pricing.md) | Freeze vs derive; content and price are computed; which stage prices which order |
| [schemas.md](schemas.md) | Schemas grouped by what the thing is; what dissolves |
| [api-layers.md](api-layers.md) | db / domain / http; five CRUD verbs; one file per use case; no spreading |
| [migration-plan.md](migration-plan.md) | Continue, do not restart; the summary sequence; what dev loses |
| [migration-spec.md](migration-spec.md) | The full spec: seven phases, backfill mappings, acceptance per phase, agent tiers |
| audit-january-schemas.md | Normalization audit of every non-exchange table (written by the Phase 0 audit) |

## The principles, in one place

1. **Freeze what changes outside your control. Derive what is a pure function
   of frozen inputs.** Spot, premium and sales-tax rate are frozen on the
   order. Content and price are computed on read. Snapshots that stay:
   `orders.spots`, `orders.addresses`.
2. **Copy when the copy is a historical freeze. Link when it is the same live
   thing.** A lot is the same physical metal in the cart, on the order and at
   the refiner, so it is one row and three links. A spot is a price that will
   move, so it is a copy. A premium is per (order, lot), never per order.
3. **The lot is the only join between a customer order and a refiner order.**
   They are separate orders. Nothing points from one to the other.
4. **The client sends ids for what the server holds and shapes only for what
   it does not.** If the server could have looked it up, the id is the whole
   message.
5. **The frontend informs no API decision.** Jacob, verbatim: *"Don't let the
   frontend inform our decision making on the api AT ALL. We should be fully
   ignoring the legacy frontend."* Wire shapes change as the model changes;
   the frontend adapts after the code is written, per surface.
6. **Measurements are never overwritten.** The assay is a new row at a new
   stage. The declared weights survive so the variance can be measured.
7. **Every table is CRUD.** Five verbs per repo, no logic, no `INSERT … SELECT`.
   Derivations are pure functions in the domain layer.
8. **The covenant is unchanged.** `exchange` holds every row the business
   has; nothing overwrites, truncates or deletes it. Every backfill reads
   from it. Production is not touched until the model is proven on a UAT
   copy.
