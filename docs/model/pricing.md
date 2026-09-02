# Pricing — freeze vs derive

Jacob: *"we'd probably want to remove price and content from the items since
they are derivable."*

## The rule

**Freeze what changes outside your control. Derive what is a pure function of
frozen inputs.**

| Value | Frozen or derived | Where |
| --- | --- | --- |
| spot (bid, ask, percentages) | frozen per order per metal | `orders.spots` |
| premium | frozen per line | `orders.lines.premium` |
| sales tax charged | frozen per line (rates change by legislation) | `orders.lines.sales_tax_charged` |
| weights, purity | facts, by stage, never overwritten | `items.measurements` |
| content | **derived**: post_melt × purity × unit factor | domain `rules.ts` |
| price | **derived**: spot × content + premium, × quantity | domain `rules.ts` |
| the refiner's realised price | frozen per lock | `refiners.pool_entries.price` |

This matches the standing law that the frontend computes no money and every
customer-visible number comes from the `/quotes/*` endpoints (D81–D84):
derivation on read is what those endpoints already are.

## Which stage prices which order

A domain rule, not a column. Recorded here so no session invents a different
one:

- A **customer purchase order** prices on the latest `declared` measurement
  until an `assayed` one exists, then on `assayed`. The customer is paid on
  `settled` content if present, else `assayed` content, at the customer's
  frozen spot.
- A **customer sales order** (bullion) prices on the declared measurement
  minted from the product at add-to-checkout ([lots.md](lots.md)).
- A **refiner order** has no realised price of its own; the money is on the
  pool lock ([refining.md](refining.md)). Its frozen spot row is informational
  — the spot on the day the metal shipped.

## What the analytics become

Because both deals hang off the same lot, gain decomposes into its causes,
which the old model could not do because the assay overwrote the declared
weights:

- **spot movement** — lock price minus the customer's frozen spot, × content
- **assay variance** — assayed content minus declared content, at the lock
  price
- **premium spread** — what we paid the customer vs what the refiner paid us
- **fee**

Those sum to the margin per lot. Per-metal or per-period rollups are a
`GROUP BY`. All of it is a view in a `reporting` schema, derived on read,
never stored. If per-lot attribution of locked ounces is wanted, it is a
first-in-first-out allocation across the credit entries, computed in the
view. The number the business actually watches — gain on spot per metal per
period — needs no allocation at all.
