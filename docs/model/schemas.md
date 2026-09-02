# Schemas — grouped by what the thing is

The eighteen January schemas kept `exchange`'s denormalization table for
table under new names. This is the regrouping. Rename where it buys clarity;
keep the name where it does not.

| Schema | Holds | Notes |
| --- | --- | --- |
| `catalog` | bullion, mints, metals | was `products` + `metals`; keep `products` if the rename buys nothing |
| `pricing` | spots, rates, sales_tax, sales_tax_rules | the LIVE inputs to a price, and only those — not items |
| `items` | items, measurements | the lots. See [lots.md](lots.md) |
| `orders` | orders, lines, spots, addresses | counterparty orders. See [orders.md](orders.md) |
| `checkout` | checkouts, lines | disposable device-sync |
| `transactions` | methods, details, intents, attempts, ledger, settlements, stripe_charges, payouts | renamed from `payments`; absorbs `orders.transactions` per D211; details holds provider refs plus one sealed envelope, no card columns |
| `refiners` | refiners, pool_entries | shrinks to the counterparties and the pool. See [refining.md](refining.md) |
| `fulfillments` | fulfillments, methods, pickups, directs, shipments | unchanged |
| `shipping` | carriers, services, packages, shipments, pickups, tracking | unchanged |
| `places` | addresses, locations, location_hours, user_addresses | unchanged |
| `auth` | users, sessions, account, verification, employees | unchanged, cut over, pinned — leave alone |
| `organizations`, `media`, `leads`, `reviews`, `rates` | as today | `rates` may fold into `pricing` |
| `reporting` | views only | the analytics in [pricing.md](pricing.md) |
| `auctions` | — | not designed; not counted until it is |

## What dissolves

- `checkout.items`, `orders.items`, `refiners.items` → `items.items` +
  `items.measurements` + the two `lines` link tables.
- `refiners.orders`, `refiners.spots` → rows in `orders.orders` / `orders.spots`
  with a `refiner_id`; pool values → `refiners.pool_entries`.
- `orders.transactions` → `transactions.*` rows keyed by order; the shipping
  charge → the shipment.
- `payments` → `transactions` (rename).

## What does not move, ever

`exchange`. Every table, every row. It is what the backfills read from and
what the eventual production sequence starts from. `pg_dump` first.
