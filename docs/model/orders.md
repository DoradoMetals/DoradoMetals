# Orders

## An order has a counterparty

```
orders.orders
  id, number, direction, status, notes, created_by_id, …
  user_id      uuid?      the customer, or
  refiner_id   uuid?      the refiner
  CHECK (num_nonnulls(user_id, refiner_id) = 1)
```

A refiner order is a row in `orders.orders` with a `refiner_id`. It has lines,
it has spots, it has transactions, and it uses the same repo, the same read
and the same pricing function as a customer order.

**Refiner orders are separate orders.** Jacob: *"We don't necessarily need to
attach what the refinery order to the customer order. At the end of the day
they are separate."* There is no foreign key between them. The lot is the only
join: "where is this customer's metal" follows the lot id to whatever refiner
order's line references it. That also makes pooling free — one refiner order
holds lots from ten customer orders, one customer's lots split across two
refiner shipments — and it gives a lot on a customer order with no refiner
line yet a meaning the one-to-one model could not express: metal the business
holds, marked at today's spot.

`refiners.orders`, `refiners.items` and `refiners.spots` dissolve. `refiners`
shrinks to the counterparties themselves. See [refining.md](refining.md) for
where the pool values went.

## Direction is from the business's viewpoint

A customer selling scrap is a **purchase**. Sending that scrap to a refiner is
a **sale**. A customer buying bullion is a **sale**. So the admin "sales
orders" list filters on counterparty or it shows refiner shipments beside
customer bullion sales. A read filter, decided on purpose.

## Lines link

```
orders.lines
  id, order_id, item_id
  premium             numeric      frozen: the premium agreed for THIS deal
  sales_tax_charged   numeric      frozen: the tax rate can change by legislation
  confirmed           boolean
  UNIQUE (order_id, item_id)
```

A line does not describe the metal; the lot does. A line carries the money
that belongs to this stage of the lot's life and nothing else. No `price` —
see [pricing.md](pricing.md).

The premium is per (order, lot), never per order: the same lot on a customer
order and a refiner order carries two different premiums, one per line. An
order has no premium of its own.

## Spots freeze

```
orders.spots
  order_id, metal_id, bid, ask, scrap_percentage, bullion_percentage, locked_at
```

One row per metal per order, written when the order is placed (customer) or
created (refiner). This is a copy on purpose: the price will move and the
deal was struck at this one. The refiner side's *realised* price is not here
— it lives on the pool lock, see [refining.md](refining.md).

## Addresses snapshot

`orders.addresses` stays as the immutable snapshot it already is (ruling,
2026-08-28). A customer editing their address book must not rewrite where an
order shipped.

## `orders.transactions` dissolves

Today it mixes a freeze (shipping charge and service), a link (payout
details) and money facts (used funds, payout fee). Under D211 — *every
decision is a payment fact* — the money facts belong in the `transactions`
schema against the order they settle, the payout-details link belongs on that
same row, and the shipping charge belongs on the shipment that incurred it.
The table has nothing left to hold.

## When is a customer order payable

When every lot on its lines has an **assayed** measurement. That is a query
over the lot ids, true the moment the refiner's settlement data is recorded,
before any money moves from the refiner. If the business ever pays on the
received weight instead, it is the same rule with a different stage and no
table changes.
