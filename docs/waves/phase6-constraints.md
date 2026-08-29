# Phase 6 (PROPOSED) — the new schema enforces what exchange did

Owner: unassigned. Brief by the coordinator 2026-08-29 under ruling 39.
**Not approved yet** — phases 5–9 are a proposal in WAVES.md.

```
1. audit:constraints gets an ACCEPTED map  ░░░░░░░░░░░░░░░░░░    0%
2. The 27 NOT NULLs, walked once           ░░░░░░░░░░░░░░░░░░    0%
3. The unique indexes: real gaps only      ░░░░░░░░░░░░░░░░░░    0%
4. audit:constraints joins pnpm check      ░░░░░░░░░░░░░░░░░░    0%
```

## Why this is upside down today (D63)

`audit:constraints` reports **27 NOT NULL constraints promotion would drop** and
**7 of 16 unique indexes with no exact counterpart**, and it has **no `ACCEPTED`
map and is not in `pnpm check`**. Its siblings `audit:indexes` and
`audit:query-paths` have both. Those guard *latency*. This one guards whether an
order can exist without a total.

Its closing line is *"each one should be a decision rather than an accident"* and
there is nowhere to record the decision. That is the whole phase.

## Do NOT gate it first

Adding it to `pnpm check` with 27 unaccepted findings paints the gate red for a
known thing and trains everyone to ignore it — the same reasoning that keeps
`audit:enum-domains` and `audit:payments` out. Walk the findings, fill the map,
**then** gate. Pin from both sides like its siblings: an unaccepted finding
fails, and an `ACCEPTED` entry that stops reporting is called out, so a fixed
constraint cannot leave a stale excuse behind.

## The findings are not one kind, and sorting them is the work

**Genuinely WIDER and correct** — these want an `ACCEPTED` entry with the
reasoning, not a migration:

- `exchange.carts(user_id)` and `sell_carts(user_id)` →
  `checkout.checkouts(user_id, direction)`. Two tables became one with a
  discriminator; a user legitimately has a buy cart *and* a sell cart. The wider
  index is the correct translation.
- `exchange.purchase_orders(order_number)` → `orders.orders(direction, number)`.
  Same shape: two tables with independent sequences merged into one. Worth
  confirming the sequences really were independent before accepting.

**Real gaps, in descending order of what they protect:**

- **`exchange.scrap(purity)` and `(purity_actual)` CHECK (>= 0 AND <= 1)** —
  `orders.items(purity)` and `refiners.items(purity)` have **nothing standing in
  for them**. `purity_actual` multiplies into `content_actual`, which is what a
  customer is **paid** on (D47). A purity of 12 is arithmetic nonsense that the
  old schema refused and the new one accepts. Related to D61, which found the
  *precision* of these columns unfixed at the source — same two columns, and
  they now have neither the range guard nor the width.
- **`exchange.payment_intents(payment_intent_id)`** — the target's only
  counterpart is `payments.details(provider, provider_ref)`, on the wrong table.
  This is the Stripe webhook path, where duplicate delivery is normal and
  uniqueness is what makes replay idempotent. See also the standing thread where
  production has no record of **$126.48** it was paid.
- **`exchange.carrier_services(carrier_id, code)`** — no counterpart in
  `shipping.services` at all.
- **`exchange.cart_items(cart_id, product_id)`** — no counterpart. Lower stakes
  by the project's own rule (`checkout.*` is device-sync, not a ledger), so it
  should be fixed but must not block the phase.

## The 27 NOT NULLs

Mostly `exchange.sales_orders`: `order_total`, `sales_tax`, `shipping_cost`,
`item_total`, `base_total`, `charges_amount`, `pre/post_charges_amount`,
`subject_to_charges_amount`, `used_funds`, `order_number`, `sales_order_status`.
Then `payouts.method`, `payouts.account_holder_name`,
`account_transactions.occurred_at`, `metals.ask_spot`, `products.quantity`,
`leads.priority`, `rates.created_by/updated_by`, `carrier_pickups.pickup_status`,
`sell_cart_items.quantity`, `payment_intents.type`.

**Read D63's own warning before touching these.** `orders.transactions` showed
`total NULL 14, items/sales_tax NULL 22` and it looked like data loss; split by
direction it reverses completely — **every null is a purchase-order row and
sales orders are 15/15 populated**, because `exchange.purchase_orders` has no
`order_total`/`sales_tax`/`item_total` columns *at all*. Structurally necessary,
not accidental. One `GROUP BY` reversed the conclusion. Expect more of these:
a merged table takes nulls from the side that never had the column.

**And never add NOT NULL from dev row counts** — dev holds tens of rows. Use
`audit:nullability` against production.

## The split

Whether a column should be NOT NULL is a quality call and belongs to whoever
takes this lane (ruling 39). The four production rows where the payout fee
disagrees with the constants table (D117) is a **business** call and stays
Jacob's — measuring it does not make it mine.
