# Inventory: how lots, orders, refiners and payouts fit

Written 2026-09-11 for the Orders & Lots designs (Figma Orders, page
618:4459). The knot Jacob named: orders are usually one-to-one with refiner
orders but sometimes batched; payouts wait for the refiner today but must be
allowed earlier later; bullion inventory can fill a sale with no refiner
order at all. Four ideas untie it.

## 1. A lot is a thing; an order is a contract. Inventory is where the lots are.

Every lot has exactly one **position** at any moment, derived from the link
tables (never a column somebody forgets to update):

| position | meaning | how it is known |
|---|---|---|
| `incoming` | on a placed customer purchase order, not yet received | `orders.lots` row, order not received |
| `on hand` | received (and assayed) in our custody, assigned to nothing | received, no `refining.lots` link, no sale link |
| `at refiner` | assigned to a refiner sale order (batched, sent) | `refining.lots` row on an open refiner order |
| `pooled` | refined; its fine ounces sit in the pool ledger | the refiner order settled; `refining.pool` credited |
| `sold` | left on a customer sale order | `orders.lots` row on a sale |
| `consumed` | split into new lots | `split_from_id` on the children |

**Inventory = the lots on hand plus the pool balances per metal.** The
inventory screen is a filter on position; nothing else is needed.

## 2. Refiner orders are optional and many-to-many, and that is fine

A refiner sale order is a batch of on-hand lots. One customer order to one
refiner order is just the common case of the many-to-many the build already
has (`refining.lots`). Batch = select on-hand lots from any orders and mint
one refiner order; Combine = merge lots before sending (only while on hand).
Nothing special exists for the one-to-one case; it never needs to.

## 3. When the customer is paid is a POLICY, not a position

The payout is its own state machine (rails). What gates "Send payment" is a
rule with a setting:

- `after_settlement` (today): every refinable lot on the order is `pooled`
  (its refiner order settled), bullion lots are `on hand` or `sold`.
- `on_assay` (later): every lot on the order is received and assayed.

Switching the setting is the whole change. The screen shows the gate's
reason ("waiting on refiner settlement for 2 of 3 lots") from the rule.
Sales orders are the mirror: the customer's charge must be `received` before
we buy from a refiner or release inventory.

## 4. A sale is filled from a SOURCE, chosen per line

| source | what happens to lots |
|---|---|
| inventory | an `on hand` bullion lot moves to `sold`; no refiner order |
| refiner (drop ship) | a refiner purchase order is minted; its lots arrive `sold` straight to the customer (Linked Fulfillment) |
| pool | fine ounces are debited from the pool and minted as a lot for the sale |

The "sourcing bar" on the Sales screen is this choice. A sale with every
line from inventory has no refiner order, and that is the normal case for a
Gold Eagle we hold.

## What the screens need to show, in these words

- Lot rows and tiles carry the **position** (six states), not "assigned /
  unassigned" alone; "unassigned" is `on hand`.
- The Order card summarises its lots by position ("3 lots: 1 on hand, 2 at
  refiner") and its payout gate reason.
- The Selection bar's actions are position transitions: Batch (on hand ->
  at refiner), Assign to sale (on hand -> sold), Combine (on hand only).
- The Unassigned cards per metal are the inventory counts: on-hand lots and
  pool ounces per metal.
- A payout policy switch lives in settings, not on the order.

## What the API has and lacks

Has: lots, `orders.lots`, `refining.lots`, `refining.pool`, splits, the
finalize gate, the payout state machine. Lacks: the derived `position` view,
the payout policy setting and its gate rule, sale sourcing (inventory and
pool as sources beside drop ship), Batch across orders as one call, Combine.
