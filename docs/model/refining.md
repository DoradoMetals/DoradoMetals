# Refining and the pool

## A settlement is two things in one document

Jacob: *"we only know what to pay customers because we get those values from
the settlements that we get sent. That doesn't necessarily mean we have to
tie them together though, we can receive their settlement data without
taking money (sending it to pool)."*

- **Data** — what each lot assayed at. Written as an `assayed` measurement row
  per lot ([lots.md](lots.md)). This is what makes the customer order payable
  ([orders.md](orders.md)), and it is the same row whether the business takes
  cash or pools the metal.
- **Money** — what the refiner owes for it. Ounces credited to the pool; cash
  only when a lock is taken out. Nothing about it touches the customer order.

The coupling between "what the refiner said" and "what we pay the customer"
lands on the **measurement**, not on a link between orders.

## The pool is a ledger of ounces

The January model squeezed this into `refiners.spots.pool_oz_deducted`. It is
really an account: per refiner, per metal, entries of ounces in and ounces
out.

```
refiners.pool_entries
  id
  refiner_id     uuid
  metal_id       uuid
  kind           enum       credit | lock
  ounces         numeric    positive; sign is implied by kind
  price          numeric?   locks only: the spot locked with the refiner
  order_id       uuid?      credits only: the refiner order the settlement came from
  entered_at     timestamptz
  notes          text?
```

- A **credit** is a settlement landing: plus N ounces, citing the refiner
  order.
- A **lock** is the business taking metal out: minus N ounces at price P on
  date D. Jacob: *"we do lock spots with refiners when we take it out of
  pool."* A lock is not tied to a lot or an order — the ounces came from
  however many settlements were sitting in the pool.
- **Balance** = credits − locks. **Open exposure** = unlocked balance ×
  today's spot. **Owed to us** = locked ounces × locked price, less what has
  arrived.
- **Cash arriving** is a row in the `transactions` schema that cites the lock.
  A lock with no transaction against it is money the refiner has not yet
  paid, which is a report the business wants.
- A settlement paid straight to cash is a credit and a lock on the same day.
- Partial locks fall out for free: thirty-seven ounces in, lock ten today and
  twelve next week, two entries.

`pool_remediation` and the refiner `fee` are money facts and go to
`transactions` against the refiner order.

## The use cases

- **record-settlement** — for each lot on the refiner order, insert the
  assayed measurement. Credit the pool with the settled ounces. Never touches
  a customer order.
- **lock-from-pool** — ounces out at a stated price. Keyed by refiner and
  metal.
- **pay-customer** — checks the payable rule, prices the order on `settled`
  content if present, else `assayed` content, at the *customer's* frozen
  spot, writes the payout transaction.

None of the three knows about another's order. The lot connects them for
the data, the ledger for the metal.

## The one rule that must be written down

A customer is paid on the **settled measurement if present, else the assayed
measurement, at the customer's frozen spot**, never on the refiner's lock
price. The lock is the business's side of the trade; a good lock is margin,
and the customer does not participate in it.
