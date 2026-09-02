# Lots and measurements

## The problem this replaces

`checkout.items`, `orders.items` and `refiners.items` carried the same nine
physical columns: `bullion_id, metal_id, pre_melt, post_melt, purity, content,
premium, quantity, unit`. Dev held 72 rows in `orders.items` and 72 in
`refiners.items`, linked one-to-one by `order_item_id`. `refiners.items`
existed for one reason: the assay weights differ from the declared weights,
and the January design modeled "same lot, later measurement" as a second
table. `exchange` did the same with `*_actual` columns on `scrap`. The
checkout copy existed because placing an order copied the cart line column
by column.

Two things were stacked: the same **lot** copied as it moved between
containers, and the same **measurement columns** repeated once per stage.

## The tables

```
items.items
  id              uuid        minted when the line enters a checkout; survives to the refiner
  bullion_id      uuid?       a catalogue product, or
  metal_id        uuid        the metal of a scrap lot (bullion lots carry the product's metal too)
  unit            text        the unit the weights are declared in
  quantity        numeric     default 1
  created_by_id, created_at, updated_at

items.measurements
  id              uuid
  item_id         uuid        -> items.items
  stage           enum        declared | received | assayed | settled
  pre_melt        numeric?
  post_melt       numeric?
  purity          numeric     UNCONSTRAINED scale — .9999 must survive (D200)
  measured_by_id  uuid?
  measured_at     timestamptz
```

There is no `content` column and no `price` column. See [pricing.md](pricing.md).

## The stages

- **declared** — what the customer says the lot is. Written at add-to-checkout
  by the customer, or by an admin edit later. An admin correction is a *new*
  declared row, not an update.
- **received** — what the business weighed when the parcel arrived. Belongs to
  neither order; it is the business's own fact about the lot.
- **assayed** — what the refiner reported once the metal was melted. Written
  by the refiner-settlement use case, keyed by lot.
- **settled** — the values the business decides to pay on, when they differ
  from the refiner's report. Written by us. (Assumed from Jacob's
  2026-09-02 note that the same lot has different values between us and the
  refiner; confirm.)

Rows are append-only in practice. "The latest row at stage X" is a rule in
the domain (`latestStage`), not a column.

## Bullion lots get a declared row too

A bullion lot's content used to derive live from `products.bullion`. That
means an admin editing a product's weight reprices every historical order
that ever held it. So at add-to-checkout the domain mints a declared
measurement for a bullion lot from the product's weight and purity. After
that, bullion and scrap price through the same function on the same rows,
and D212's "the scrap IS the line" holds all the way down.

## Who links to a lot

```
checkout.lines   (checkout_id, item_id, premium)                   the cart
orders.lines     (order_id,    item_id, premium, sales_tax_charged) any order, either counterparty
```

A lot appears on one checkout line (until placed), one customer order line,
and later one refiner order line. That is a domain rule, not a constraint;
`UNIQUE (order_id, item_id)` is the only uniqueness the table enforces.

The premium is per (order, lot): the customer order's line holds what we pay
the customer (for example 90% on gold); the refiner order's line for the
same lot holds what the refiner pays us (for example 98%). An order has no
premium of its own.

## Orphans

Checkout is device-sync, not a ledger (Jacob, 2026-08-29). A cart emptied
before ordering leaves a lot no line points at. That is fine. The future
cancelled-orders purge sweeps unlinked lots too.
