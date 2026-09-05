# Lots

The lot is the only join. One physical lot is one row. It is minted at
checkout and its id survives to the refiner. Refiner orders are the
business's own sales orders. One purchase order is not one refiner order.

Rulings 40-42 give the shape; 51, 71-78 give the rules it obeys. Design
only. No code, no migration, no lane.

## 1. The model

`lots.items` holds the thing. Everything else links to it.

```sql
CREATE SCHEMA lots;

CREATE TABLE lots.items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bullion_id     uuid REFERENCES products.bullion (id),
  metal_id       uuid NOT NULL REFERENCES metals.metals (id),
  unit           text,
  quantity       numeric NOT NULL DEFAULT 1,
  pre_melt       numeric,
  post_melt      numeric,
  purity         numeric,
  split_from_id  uuid REFERENCES lots.items (id)
  -- + the four audit columns (116)
);
```

`pre_melt`, `post_melt` and `purity` are the CUSTOMER's numbers. A bullion
lot takes them from the product at mint time (ruling 51, migration 120), so
an old order never reprices. `content` is not a column: it is
`fineContent(post_melt ?? pre_melt, unit, purity)`, and every input is
frozen on the row. `price` is not a column either.

Three link tables. Each carries only the money of its own stage.

```sql
CREATE TABLE checkout.lots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id  uuid NOT NULL REFERENCES checkout.checkouts (id) ON DELETE CASCADE,
  lot_id       uuid NOT NULL REFERENCES lots.items (id),
  UNIQUE (checkout_id, lot_id)
);

CREATE TABLE orders.lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders.orders (id) ON DELETE CASCADE,
  lot_id             uuid NOT NULL REFERENCES lots.items (id),
  premium            numeric NOT NULL,
  sales_tax_charged  numeric NOT NULL DEFAULT 0,
  confirmed          boolean NOT NULL DEFAULT false,
  UNIQUE (order_id, lot_id)
);
```

A basket carries no premium: at checkout it is a live quote from the
product and the metal percentage. On the order it is the frozen term.

The refiner side is its own schema.

```sql
CREATE SCHEMA refining;

CREATE SEQUENCE refining.order_number_seq;

CREATE TABLE refining.orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number               bigint NOT NULL UNIQUE
                         DEFAULT nextval('refining.order_number_seq'),
  refiner_id           uuid NOT NULL REFERENCES refiners.refiners (id),
  sent_at              timestamptz,
  settled_at           timestamptz,
  fee                  numeric,
  statement_reference  text
  -- + the four audit columns (116)
);

CREATE UNIQUE INDEX one_open_order_per_refiner
  ON refining.orders (refiner_id) WHERE sent_at IS NULL;

CREATE TABLE refining.lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refining_order_id  uuid NOT NULL REFERENCES refining.orders (id) ON DELETE CASCADE,
  lot_id             uuid NOT NULL UNIQUE REFERENCES lots.items (id),
  pre_melt           numeric,
  post_melt          numeric,
  purity             numeric,
  premium            numeric,
  settled_at         timestamptz
);
```

`refining.lots` holds the REFINER's assay. `UNIQUE (lot_id)` is the pooling
guarantee: metal goes to one refiner. Lots of one purchase order may sit on
different refiner orders; one refiner order holds lots of many purchase
orders. No FK joins a refiner order to a customer order.

The pool is a ledger.

```sql
CREATE TYPE refining.pool_entry AS ENUM ('credit', 'lock', 'fee');

CREATE TABLE refining.pool (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refiner_id         uuid NOT NULL REFERENCES refiners.refiners (id),
  metal_id           uuid NOT NULL REFERENCES metals.metals (id),
  entry              refining.pool_entry NOT NULL,
  troy_oz            numeric,
  lock_price         numeric,
  amount             numeric,
  refining_order_id  uuid REFERENCES refining.orders (id),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  -- + the four audit columns (116)
  CONSTRAINT lock_has_a_price CHECK (entry <> 'lock' OR lock_price IS NOT NULL),
  CONSTRAINT metal_moves_or_is_a_fee CHECK (entry = 'fee' OR troy_oz IS NOT NULL)
);
```

A settlement writes `credit` (+oz, citing the refiner order). Taking metal
out writes `lock` (-oz at `lock_price`); cash cites the lock. Balance is
`sum(troy_oz)` per refiner per metal.

The lock price is the REFINER's. It never prices a customer. The customer is
paid on `orders.spots`, frozen for that order. The two prices never meet.

Payable: a purchase order is payable when every lot on it that needs
refining has a `refining.lots` row with `settled_at IS NOT NULL`. A
`NOT EXISTS` in the order view, not a column.

## 2. What dies

- `orders.items` splits. Physical columns (`bullion_id`, `metal_id`, `unit`,
  `quantity`, `pre_melt`, `post_melt`, `purity`) go to `lots.items`. Terms
  (`premium`, `sales_tax_charged`, `confirmed`) go to `orders.lots`.
  `content` and `price` are derived and are not carried.
- `checkout.items` splits the same way; `premium` and `content` die.
- `refiners.items` becomes `refining.lots`: `order_item_id` -> `lot_id`,
  `refiner_order_id` -> `refining_order_id`, `content` derived.
- `refiners.orders` becomes `refining.orders`. `order_id` DIES. That column
  is the thing that forbids pooling today. `pool_oz_deducted` and
  `pool_remediation` become `refining.pool` entries.
- `refiners.spots` dies whole. The customer freeze is `orders.spots`, the
  refiner price is `lock_price` on the lock. The table prices nothing.
- `orders.transactions.refiner_fee`, `.pool_oz_deducted` and
  `.pool_remediation` move to `refining.orders.fee` and `refining.pool`.
- `orders.spots` and `orders.addresses` stay as they are.

Views (ruling 71 - a view is one SQL read):

- `OrderView.items` becomes `OrderView.lots`: `orders.lots` joined to
  `lots.items`, product nested as now, `content` and `payable` as CASE
  expressions, plus `settled` per lot and `payable` on the order.
- `RefinerOrderView` is new: `refining.orders` + refiner + `jsonb_agg` of
  `refining.lots` joined to `lots.items`, plus the pool balance per metal.
- Contracts regenerate: `OrderItem` becomes `Lot` + `OrderLot`,
  `RefinerItem` becomes `RefiningLot`. Wire shapes change; the frontend
  follows after (ruling 44).

## 3. Domain fit (ruling 77)

**Schema `lots`, no domain `lots`.** The DB layer stays by schema:
`db/lots/items`, `db/checkout/lots`, `db/orders/lots`,
`db/refining/{orders,lots,pool}`. Feature code is by domain, and a lot has
no workflow of its own: checkout mints it, orders and refining read it,
pricing derives its content. A `lots` domain would hold five CRUD calls and
zero decisions. Make it `inventory` later, when lots gain storage and a life
away from an order.

**`refining` is its own domain, not part of orders.** A refiner order has
its own number, lifecycle (open, sent, settled), money (fee, pool) and
counterparty. Ruling 42 says the two orders are separate; one domain over
both puts that back. `refiners` stays the counterparty table under parties.
`refining` holds four commands: `sendToRefiner`, `shipRefiningOrder`,
`recordSettlement`, `lockFromPool`. Add it to ruling 77's list.

**Pricing (ruling 75).** `priceOrder(order_id)` reads `orders.lots` +
`lots.items` + `orders.spots` - always the customer's frozen spot.
`priceCheckout(checkout_id)` reads `checkout.lots` + live spots and premiums.
`priceRefiningOrder(id)` prices from the pool: settled troy oz at the lock
price, less the fee. Three reads, one domain. Nothing else sums a price.

## 4. Migration path

Dev, read-only, 2026-09-05: 78 orders (44 purchase, 34 sale). 88
`orders.items` (68 bullion, 20 scrap; 53 purchase, 35 sale). 78
`refiners.orders` - one per customer order, 34 of them shadowing a SALE
order, 31 with a `refiner_id`, 16 with `pool_oz_deducted`. 88
`refiners.items` - one per `orders.items` row, all 88 resolving, 68 of them
mirroring bullion that is never assayed, 7 with assay content. 261
`refiners.spots`. 257 `orders.spots`. 6 checkouts, 3 checkout items, 2
refiners. **Zero pooling exists today**: no refiner order holds lots of more
than one purchase order, and no purchase order splits across refiner orders.
`checkout.items` ids do not survive into `orders.items` - 0 of 88 share one.

Steps, each a migration, `exchange` untouched throughout:

1. Create schemas `lots` and `refining` and the six tables, empty. Register
   the audit triggers (116). Additive.
2. Backfill `lots.items` from `orders.items`, **id preserved**. 88 rows.
   Then `orders.lots` from the same rows. Every existing id keeps its key,
   so nothing that cites an item id breaks.
3. Backfill `lots.items` + `checkout.lots` from `checkout.items`, ids
   preserved. 3 rows, disposable either way.
4. Backfill `refining.orders` from the 31 `refiners.orders` rows with a
   `refiner_id` on a purchase order; the 34 sale shadows record nothing and
   are not carried. Then `refining.lots` from their `refiners.items`, with
   `lot_id = order_item_id` - a `lots.items` id after step 2.
5. Backfill `refining.pool`: a `credit`/`lock` pair per `pool_oz_deducted`
   (16 rows), a `fee` entry per `fee` (31 rows).
6. Views and contracts: `OrderView` reads lots; `RefinerOrderView` is added.
   `validate:wire` proves every shape against live rows.
7. Switch reads and writes to the new tables. Code only.
8. Drop `orders.items`, `checkout.items`, `refiners.items`,
   `refiners.orders`, `refiners.spots`. LAST, its own migration, one release
   after the reads moved. Native schemas, not `exchange`, so `lint:migrations`
   allows it and the covenant is untouched.

Steps 1-6 add only. Step 7 reverts by reverting code. Step 8 is the one
one-way door, and every row it drops was copied in steps 2-5.
`scripts/lib/feature-map.mjs` needs the new mapping (`orders.items` ->
`lots.items` + `orders.lots`) before step 8, or `audit:coverage` reports
`exchange` columns with nowhere to go.

**Production.** This chain runs AFTER the existing sequence, never inside
it. Production's `orders.*` holds the January snapshot, and the backfills
that fix it read `exchange` and WRITE `orders.items` - the table step 8
drops. So: `pg_dump`, genesis + 001-130, the `exchange` backfills,
`verify:parity` and `compare:databases`, merge. Only then this chain, as
ordinary migrations against real history.

## 5. For Jacob

1. **Does a bullion lot get assayed?** Recommend no. The code already
   refuses it (`assertScrapLine`), and 68 of dev's 88 refiner rows mirror
   bullion for nothing. A bullion lot may join a refining order; its assay
   columns stay null and the settlement is the premium and the fee.
2. **Can a lot be split after minting?** Recommend no split in place. A
   split mints new lots and sets `split_from_id`. The id must survive to the
   refiner; rewriting a lot's quantity breaks that.
3. **Pool per refiner per metal, or per refiner order?** Recommend per
   refiner per metal: it is a running balance, not an event. Every entry
   cites its refiner order when it has one.
4. **Do sales orders use lots?** Recommend yes. `orders.lots` is the only
   line table, so a sale line is a lot: bullion, quantity N, no assay, never
   sent to a refiner. 35 of dev's 88 lines are sale lines. A second line
   table brings back the three-item-table sprawl this removes.
5. **Payable on EVERY lot, or every lot that needs refining?** Recommend the
   second. If bullion never reaches a refiner, "every lot settled" is never
   true for a mixed order and nothing is ever payable. The rule reads over
   the lots that need refining; a bullion lot is settled when confirmed.
