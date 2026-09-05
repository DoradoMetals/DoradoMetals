# Lots

The lot is the only join. One physical lot is one row. It is minted at
checkout and its id survives to the refiner. Refiner orders are the
business's own orders. One customer order is not one refiner order.

Rulings 40-42 give the shape; 51, 71-80 give the rules it obeys. Design
only. No code, no migration, no lane.

---

## 0. The five-minute read

**What it is.** Three item tables (`checkout.items`, `orders.items`,
`refiners.items`) become one table of physical things — `lots.items` — plus
three link tables that carry only the money of their own stage. A lot's id is
minted once, in the basket, and is the same id the refiner settles.

**Nine tables, two new schemas.** `lots.items`; `checkout.lots`,
`orders.lots`; `refining.orders`, `refining.lots`, `refining.pool`. Six new
tables, two new schemas (`lots`, `refining`), no table dropped until the reads
have moved.

**What it buys.**
- Pooling. `refining.orders` has no `order_id`, so one refiner order holds
  lots of many customer orders and one customer order splits across refiners.
  Today `refiners.orders.order_id` forbids both, and dev has zero pooling
  because the column will not allow it.
- One definition of fine content. `content` becomes a generated column on the
  lot. `fineContent` in TypeScript dies, and no read can disagree with another.
- One counterparty model. `refining.orders.direction` covers both live refiner
  flows: `sell` (our scrap goes out to be refined) and `buy` (the supplier
  fills a customer's sales order). Today the second flow is a `refiners.orders`
  row keyed to a sale order and nothing calls it an order.
- The customer's price and the refiner's price stop touching. The customer is
  paid on `orders.spots`, frozen. The refiner settles at a `refining.pool`
  lock price. `refiners.spots` dies whole.

**What it costs.** `OrderView.items` becomes `OrderView.lots`; four contracts
are renamed; five routes move; the frontend follows after (ruling 44). Eight
decisions are Jacob's and are listed in section 8.

**Twelve things changed since the previous draft of this file**: `metal_id` is
`text` (ruling 79); `orders.lots.premium` is nullable (a bought line is placed
with none); `orders.lots.price` is added (`finalizePricing` writes a frozen
unit price and `order_pricing.sql` reads it); `content` is a generated column;
`refining.orders` gains `direction` and `refiners.refiners` FKs `NOT NULL`;
`checkout.lots` carries no premium and the write that stores one dies;
`lot_id` is `UNIQUE` in all three link tables, which is what "the id survives"
means; the pool loses its `fee` entry type and its `amount` column; and the
bullion snapshot's `post_melt` becomes `NULL`, because today it holds the
product's already-fine content beside its purity and a derived content would
apply purity twice.

**What it is not.** Not scheduled work. Not a lane. Nothing here runs before
the production migration sequence in CLAUDE.md, and section 7 says why.

---

## 1. The model

### 1.1 `lots.items` — the physical thing

```sql
CREATE SCHEMA lots;

CREATE TABLE lots.items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bullion_id     uuid REFERENCES products.bullion (id),
  metal_id       text NOT NULL REFERENCES metals.metals (id) ON UPDATE CASCADE,
  unit           text NOT NULL DEFAULT 't oz',
  quantity       numeric NOT NULL DEFAULT 1,
  pre_melt       numeric,
  post_melt      numeric,
  purity         numeric,
  content        numeric GENERATED ALWAYS AS (
                   coalesce(post_melt, pre_melt)
                   * CASE lower(unit)
                       WHEN 't oz' THEN 1
                       WHEN 'g'    THEN 1 / 31.1035
                       WHEN 'dwt'  THEN 1 / 20.0
                       WHEN 'lb'   THEN 453.592 / 31.1035
                     END
                   * purity
                 ) STORED,
  split_from_id  uuid REFERENCES lots.items (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by_id  uuid REFERENCES auth.users (id),
  updated_by_id  uuid REFERENCES auth.users (id),
  CONSTRAINT a_product_lot_is_not_melted
    CHECK (bullion_id IS NULL OR post_melt IS NULL),
  CONSTRAINT a_lot_is_not_its_own_parent
    CHECK (split_from_id IS DISTINCT FROM id),
  CONSTRAINT weights_are_positive
    CHECK (coalesce(pre_melt, 1) > 0 AND coalesce(post_melt, 1) > 0
           AND quantity > 0),
  CONSTRAINT purity_is_a_fraction
    CHECK (purity IS NULL OR (purity > 0 AND purity <= 1))
);

CREATE INDEX lots_items_bullion ON lots.items (bullion_id);
CREATE INDEX lots_items_metal   ON lots.items (metal_id);
CREATE INDEX lots_items_split   ON lots.items (split_from_id);
```

| column | one sentence |
|---|---|
| `bullion_id` | NULL is a scrap lot; set is a catalogue product, snapshotted at mint (ruling 51) so an old order never reprices. |
| `metal_id` | The metal's NAME (ruling 79). `ON UPDATE CASCADE` because a rename is Jacob's call. |
| `unit` | The unit the weights are declared in. NOT NULL because a null unit makes `content` null and today's `convertTroyOz` answers 0 for one, which is a price of zero, not an absence of one. |
| `quantity` | Pieces. A scrap lot is one lot weighed once; a product line is N identical pieces. |
| `pre_melt` | The gross declared weight. For a product lot it is `products.bullion.gross`. |
| `post_melt` | The gross weight after melt. Scrap only — the CHECK forbids it on a product lot. |
| `purity` | Fineness as a fraction. For a product lot it is `products.bullion.purity`. |
| `content` | Fine troy ounces, per piece, generated. One definition, in the database. An unknown unit yields NULL, which every read already treats as unpriceable. |
| `split_from_id` | The lot this lot was split out of. A split never rewrites a lot in place (question 2). |

`pre_melt`, `post_melt`, `purity` and `unit` are the CUSTOMER's numbers and are
frozen at mint. `price` is not a column here: the money is on the link row.

**`content` is generated, not written.** That is ruling 41 (derive what you can)
executed without ruling 78's other half being reopened: a derived value that
five SQL reads each recompute is a dictionary in another spelling. Generated
means one expression, indexable, and impossible to disagree with its inputs.
`shared/utils/convertWeights.ts` `fineContent` loses both callers and dies.

### 1.2 The three link tables

```sql
CREATE TABLE checkout.lots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id  uuid NOT NULL REFERENCES checkout.checkouts (id) ON DELETE CASCADE,
  lot_id       uuid NOT NULL UNIQUE REFERENCES lots.items (id)
);
CREATE INDEX checkout_lots_checkout ON checkout.lots (checkout_id);

CREATE TABLE orders.lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders.orders (id) ON DELETE CASCADE,
  lot_id             uuid NOT NULL UNIQUE REFERENCES lots.items (id),
  premium            numeric,
  price              numeric,
  sales_tax_charged  numeric NOT NULL DEFAULT 0,
  confirmed          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by_id      uuid REFERENCES auth.users (id),
  updated_by_id      uuid REFERENCES auth.users (id),
  CONSTRAINT premium_is_not_negative CHECK (premium IS NULL OR premium >= 0)
);
CREATE INDEX orders_lots_order ON orders.lots (order_id);
```

| column | one sentence |
|---|---|
| `lot_id UNIQUE` | The invariant that makes the id mean something: a lot sits in one basket, on one order, at one refiner. Adopting an anonymous cart is an `UPDATE checkout.lots SET checkout_id`, and the lot id survives it — today `checkout.items` ids survive into `orders.items` for **0 of 88** rows. |
| `orders.lots.premium` | NULLABLE, and this is a correction to the previous draft. `create_bought.sql` places a purchase line with no premium at all; `retierPremiums` writes it afterwards. A NOT NULL column refuses placement. |
| `orders.lots.price` | The frozen unit price `finalizePricing` writes. `order_pricing.sql` reads it as `stored_price` and reports `source = 'stored'` when it is set. Without this column the "the price floats until it is locked" rule has nowhere to land (question 6). |
| `sales_tax_charged` | What was actually charged on this line, frozen at placement. |
| `confirmed` | The admin agreed the declared weights. `allLinesConfirmed` gates `finalize_pricing` and the `Payment Processing` status. |

**A basket carries no premium.** At checkout the premium is a live quote — the
rate band for a purchase, `products.bullion.ask_premium` for a sale. Today
`checkout/service.ts` `replaceItems` writes `priceCheckout`'s per-line premium
back onto `checkout.items.premium`, and nothing reads it: `purchase_quote.sql`
prefers the band over it, `sale_quote.sql` never mentions it, and
`create_sold.sql` takes the premium from the quote at placement. That write
dies with the column.

### 1.3 `refining` — the counterparty side

```sql
CREATE SCHEMA refining;

CREATE TYPE refining.direction AS ENUM ('sell', 'buy');
CREATE TYPE refining.pool_entry AS ENUM ('credit', 'lock');

CREATE SEQUENCE refining.order_number_seq;

CREATE TABLE refining.orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number               bigint NOT NULL UNIQUE
                         DEFAULT nextval('refining.order_number_seq'),
  direction            refining.direction NOT NULL,
  refiner_id           uuid NOT NULL REFERENCES refiners.refiners (id),
  sent_at              timestamptz,
  settled_at           timestamptz,
  fee                  numeric,
  statement_reference  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by_id        uuid REFERENCES auth.users (id),
  updated_by_id        uuid REFERENCES auth.users (id),
  CONSTRAINT settled_after_sent
    CHECK (settled_at IS NULL OR sent_at IS NOT NULL)
);

CREATE UNIQUE INDEX one_open_sell_order_per_refiner
  ON refining.orders (refiner_id)
  WHERE sent_at IS NULL AND direction = 'sell';

CREATE INDEX refining_orders_refiner
  ON refining.orders (refiner_id, direction, sent_at DESC);

CREATE TABLE refining.lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refining_order_id  uuid NOT NULL REFERENCES refining.orders (id) ON DELETE CASCADE,
  lot_id             uuid NOT NULL UNIQUE REFERENCES lots.items (id),
  unit               text NOT NULL DEFAULT 't oz',
  pre_melt           numeric,
  post_melt          numeric,
  purity             numeric,
  content            numeric GENERATED ALWAYS AS (
                       coalesce(post_melt, pre_melt)
                       * CASE lower(unit)
                           WHEN 't oz' THEN 1
                           WHEN 'g'    THEN 1 / 31.1035
                           WHEN 'dwt'  THEN 1 / 20.0
                           WHEN 'lb'   THEN 453.592 / 31.1035
                         END
                       * purity
                     ) STORED,
  premium            numeric,
  settled_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by_id      uuid REFERENCES auth.users (id),
  updated_by_id      uuid REFERENCES auth.users (id),
  CONSTRAINT settled_lots_carry_a_premium
    CHECK (settled_at IS NULL OR premium IS NOT NULL)
);
CREATE INDEX refining_lots_order ON refining.lots (refining_order_id);
```

| column | one sentence |
|---|---|
| `direction` | `sell` is our metal going out to be refined; `buy` is the supplier filling a customer's sales order — the live `sendToRefiner` action, which today writes a `refiners.orders` row keyed to a sale order (question 7). |
| `refiner_id NOT NULL` | An order with no counterparty is a draft nobody can act on; today the column is nullable and dev holds rows with no refiner. |
| `number` | Its own sequence. A refiner order is an order and gets a number the business can quote on a statement. |
| `one_open_sell_order_per_refiner` | The pooling mechanic: lots accumulate onto the one open sell order per refiner until it is sent. Buy orders are excluded — several supplier orders can be open at once. |
| `refining.lots.*_melt/purity` | The REFINER's assay, kept apart from the customer's declaration on `lots.items`. Both are true; they disagree, and that disagreement is Dorado's margin. |
| `refining.lots.premium` | The fraction of spot the refiner pays Dorado (`sell`) or Dorado pays the supplier (`buy`). |
| `lot_id UNIQUE` | Metal goes to one refiner. This is the pooling guarantee stated as a constraint, not a rule in a service. |

No foreign key joins a refining order to a customer order (ruling 42). The join
is the lot, and it is one hop: `orders.lots.lot_id = refining.lots.lot_id`.

### 1.4 The pool is a ledger

```sql
CREATE TABLE refining.pool (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refiner_id         uuid NOT NULL REFERENCES refiners.refiners (id),
  metal_id           text NOT NULL REFERENCES metals.metals (id) ON UPDATE CASCADE,
  entry              refining.pool_entry NOT NULL,
  troy_oz            numeric NOT NULL,
  lock_price         numeric,
  refining_order_id  uuid NOT NULL REFERENCES refining.orders (id),
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by_id      uuid REFERENCES auth.users (id),
  CONSTRAINT a_lock_has_a_price
    CHECK (entry <> 'lock' OR lock_price IS NOT NULL),
  CONSTRAINT a_credit_adds_and_a_lock_takes
    CHECK ((entry = 'credit' AND troy_oz > 0)
        OR (entry = 'lock'   AND troy_oz < 0))
);

CREATE INDEX pool_balance ON refining.pool (refiner_id, metal_id, occurred_at);
```

| column | one sentence |
|---|---|
| `entry` | `credit` is metal the refiner now owes us, written at settlement. `lock` is metal taken back out at an agreed price. |
| `troy_oz` | Signed, so the balance is `sum(troy_oz)` and nothing has to know the entry types to add them up. |
| `lock_price` | The REFINER's price, in dollars per troy ounce, agreed when metal comes out. It never prices a customer. |
| `refining_order_id NOT NULL` | Every entry cites the order that caused it: a credit its settlement, a lock the supplier order it fills. |
| `occurred_at` | When it happened, which is not when it was typed in. |

**The table is append-only.** There is no update and no delete: a correction is
a compensating entry. That is the whole reason it is a ledger rather than a
balance column, and it is why `pool_oz_deducted` — a single mutable number on
`refiners.orders` and again on `orders.transactions` — cannot survive.

**No `fee` entry and no `amount` column** (both were in the previous draft). The
fee is `refining.orders.fee`, one number in one place; carrying it again in the
pool is the same value in two tables. Cash is `-troy_oz * lock_price` and is
derived, never stored (question 10).

`created_by_id` and `created_at` only: an append-only row is never updated, so
`updated_*` would be columns that can only ever hold their insert value.

### 1.5 Balance and payability

```sql
-- Balance: one row per refiner per metal.
SELECT refiner_id, metal_id, sum(troy_oz) AS troy_oz
  FROM refining.pool
 GROUP BY refiner_id, metal_id;
```

Payable is a predicate, not a column:

```sql
NOT EXISTS (
  SELECT 1
    FROM orders.lots ol
    JOIN lots.items li ON li.id = ol.lot_id
   WHERE ol.order_id = o.id
     AND li.bullion_id IS NULL                    -- needs refining
     AND NOT EXISTS (SELECT 1 FROM refining.lots rl
                      WHERE rl.lot_id = ol.lot_id
                        AND rl.settled_at IS NOT NULL)
)
```

A bullion lot is settled when `orders.lots.confirmed` is true. Question 5 is why
the predicate reads over the lots that need refining rather than all of them.

---

## 2. Lifecycle

A lot has no `status` column. Its state is which rows exist and which timestamps
are set — statuses stay pure customer-facing labels driving no logic
(D77-D88). Each table below reads: state, what moves it, who, what it forbids.

### 2.1 A lot

| state | how you know | what moves it | who | what it forbids |
|---|---|---|---|---|
| `drafted` | `checkout.lots` row, no `orders.lots` row | basket edit | customer, or admin via `POST /orders/admin` | assay, refining, any premium |
| `ordered` | `orders.lots` row, `confirmed = false` | `place()` — deletes the `checkout.lots` row, inserts `orders.lots`, same `lot_id` | customer or admin | basket edits; the lot's weights are the customer's declaration and frozen |
| `received` | the order's status is `Received` | admin sets the order status | admin | nothing on the lot; it is a label |
| `confirmed` | `orders.lots.confirmed = true` | admin confirms the line, having edited the weights if the parcel disagreed | admin | further weight edits (they would re-tier a priced order) |
| `assigned` | `refining.lots` row exists | `POST /refining/orders/:id/lots` | admin | assignment to a second refiner — `lot_id UNIQUE` refuses it |
| `sent` | its refining order has `sent_at` | `POST /refining/orders/:id/send` | admin | adding it to, or removing it from, that order |
| `assayed` | `refining.lots.post_melt`/`purity` set | admin records the refiner's numbers | admin | nothing; an assay may be corrected until settlement |
| `settled` | `refining.lots.settled_at` set | `POST /refining/orders/:id/settle` | admin | assay edits, and removal from the order |
| `pooled` | a `credit` entry cites that refining order | the same settlement, same transaction | admin | nothing; the credit is spendable metal |

A split (question 2) mints new lots with `split_from_id` set and leaves the
parent where it is. The parent keeps its `orders.lots` row; the children get
their own `refining.lots` rows. Nothing is ever rewritten in place.

### 2.2 A refining order

| state | how you know | what moves it | who | what it forbids |
|---|---|---|---|---|
| `open` | `sent_at IS NULL` | created by `POST /refining/orders`, or found by the partial unique index when a lot is assigned | admin | a second open `sell` order for the same refiner |
| `sent` | `sent_at` set | `POST /refining/orders/:id/send` — writes the timestamp, then emails the refiner AFTER the commit | admin | changing its lots, its refiner or its direction |
| `settled` | `settled_at` set | `POST /refining/orders/:id/settle` — writes the fee, the statement reference, every lot's assay and `settled_at`, and the pool credits, in one transaction | admin | any further write; a correction is a new pool entry |

`settled_after_sent` is a CHECK, not a rule in a service: an order cannot settle
before it went out.

### 2.3 The pool

| state | how you know | what moves it | who | what it forbids |
|---|---|---|---|---|
| `credited` | a `credit` row | settling a `sell` order | admin | nothing |
| `locked` | a `lock` row | `POST /refining/pool/locks`, or a `buy` order filled from the pool | admin | nothing at the row level; a balance may go negative and the view says so rather than the write refusing |
| — | there is no other state | — | — | UPDATE and DELETE: the table has no such endpoint |

A negative balance is a real business state (metal taken before it settled), so
it is reported, not refused. `PoolView` carries the sign.

---

## 3. Domain fit (ruling 77)

**Schema `lots`, no domain `lots`.** `api/db/` stays by Postgres schema:
`db/lots/items`, `db/checkout/lots`, `db/orders/lots`,
`db/refining/{orders,lots,pool}`. Feature code is by domain, and a lot has no
workflow of its own — checkout mints it, orders and refining read it, pricing
derives its content. A `lots` domain would hold five CRUD calls and zero
decisions. Make it `inventory` later, when lots gain storage and a life away
from an order.

**`refining` is a new domain under `api/`, not part of orders.** A refining
order has its own number, its own lifecycle, its own money and its own
counterparty. Ruling 42 says the two orders are separate; one domain over both
puts that back. `refiners` stays the counterparty table under
`orders/refiners` — no, it moves too: see the table.

| table | `db/` owner | domain that owns the actions |
|---|---|---|
| `lots.items` | `db/lots/items` | none — no workflow; minted by checkout, edited by orders |
| `checkout.lots` | `db/checkout/lots` | `checkout` |
| `orders.lots` | `db/orders/lots` | `orders` |
| `refining.orders` | `db/refining/orders` | `refining` |
| `refining.lots` | `db/refining/lots` | `refining` |
| `refining.pool` | `db/refining/pool` | `refining` |
| `refiners.refiners` | `db/refiners` | `refining` (the counterparty read moves out of `orders/refiners/`) |

`refining` holds five commands and nothing else:

| command | what it does |
|---|---|
| `assignLots(refining_order_id, lot_ids)` | inserts `refining.lots`, or finds the open order for the refiner |
| `sendRefiningOrder(id)` | stamps `sent_at`; emails the refiner AFTER the commit |
| `recordAssay(lot_id, patch)` | writes the refiner's weights on `refining.lots` |
| `settleRefiningOrder(id, body)` | fee, statement reference, per-lot premium and `settled_at`, and the pool credits — one transaction |
| `lockFromPool(body)` | one `lock` entry |

Add `refining` to ruling 77's list. Mechanically that is **one line** in
`api/package.json` `imports` (`"#refining/*": "./refining/*"`), because
`scripts/lib/layout.ts` `domainDirs()` reads that map and every lint,
`vitest.config.ts`'s aliases and its coverage keys follow from it.

### The domain-boundary rule for a lot

A lot's columns are physical facts, and everything that prices or ships one
needs them. So the rule is not "one reader" — it is:

1. **`lots.items` is READ by `checkout`, `orders`, `refining`, `pricing` and
   `media` (documents).** Those five are the `lint:domain-boundaries` exception
   entries, and the list is closed: a sixth domain needing a lot column is a
   design question, not a lint waiver.
2. **`lots.items` is WRITTEN by `checkout` (mint), `orders` (the admin's weight
   corrections before confirmation) and `refining` (splits only).** No other
   domain writes it.
3. **A link table is written only by its own domain.** `refining` never writes
   `orders.lots`; `orders` never writes `refining.lots`. The one thing they
   share is the lot id.
4. **Nobody outside `refining` reads `refining.pool`.** The balance reaches
   another domain as a view row, never as a `sum()` somebody else wrote — that
   is how `pool_oz_deducted` came to live on `orders.transactions` as well.

---

## 4. The API surface

Paths follow `docs/waves/rest-routes.md`: resource nouns, the verb is the
method, an id is a path segment, 201 on create, 204 on delete, lists are bare
arrays, an action endpoint is earned.

### 4.1 Routes

| method | path | guard | body | answers |
|---|---|---|---|---|
| PUT | `/api/checkout/lots` | requireUser | `CheckoutLotPatch[]` | `CheckoutView` |
| GET | `/api/orders/:id/lots` | requireUser + own | — | `OrderLotView[]` |
| POST | `/api/orders/:id/lots` | requireAdmin | `OrderLotCreate` | 201 `OrderLotView` |
| PATCH | `/api/orders/lots/:id` | requireAdmin | `OrderLotPatch` | `OrderLotView` |
| DELETE | `/api/orders/lots/:id` | requireAdmin | — | 204 |
| GET | `/api/refining/orders` | requireAdmin | `?refiner_id=&direction=&state=` | `RefiningOrderView[]` |
| POST | `/api/refining/orders` | requireAdmin | `RefiningOrderCreate` | 201 `RefiningOrderView` |
| GET | `/api/refining/orders/:id` | requireAdmin | — | `RefiningOrderView` |
| PATCH | `/api/refining/orders/:id` | requireAdmin | `RefiningOrderPatch` | `RefiningOrderView` |
| POST | `/api/refining/orders/:id/send` | requireAdmin | — | `RefiningOrderView` |
| POST | `/api/refining/orders/:id/settle` | requireAdmin | `RefiningSettlement` | `RefiningOrderView` |
| GET | `/api/refining/orders/:id/lots` | requireAdmin | — | `RefiningLot[]` |
| POST | `/api/refining/orders/:id/lots` | requireAdmin | `{ lot_ids }` | 201 `RefiningLot[]` |
| PATCH | `/api/refining/lots/:id` | requireAdmin | `RefiningLotPatch` | `RefiningLot` |
| DELETE | `/api/refining/lots/:id` | requireAdmin | — | 204 |
| GET | `/api/refining/pool` | requireAdmin | `?refiner_id=&metal_id=` | `PoolBalance[]` |
| GET | `/api/refining/pool/entries` | requireAdmin | `?refiner_id=&metal_id=` | `PoolEntry[]` |
| POST | `/api/refining/pool/locks` | requireAdmin | `PoolLockCreate` | 201 `PoolEntry` |
| GET | `/api/refiners` | requireAdmin | — | `RefinerView[]` (unchanged, re-mounted under `refining`) |

`send` and `settle` are earned actions: one calls an external system, the other
is non-idempotent business logic that writes four tables. Everything else is a
field change and is a `PATCH`.

Routes that die: `GET /api/orders/:orderId/refiners`, `.../refiners/items`,
`.../refiners/spots`, `PATCH /api/refiners/orders/:id`,
`PATCH /api/refiners/items/by-order-item/:orderItemId`,
`POST /api/orders/:id/send_to_refiner`, and every `/api/orders/items*` and
`/api/checkout/items*` path.

`POST /api/orders/:id/send_to_refiner` is the one with a subtlety: it is a
SALE-side action today (`actionsFor`: `send_to_refiner: sale && address`), and
it becomes `POST /api/refining/orders` with `direction: 'buy'` followed by
`assignLots` and `send`. That is three calls where there was one, so it earns a
composite: `POST /api/orders/:id/supply` `{ refiner_id }`, declared by
`orders/routes.ts` (the order id is the key the caller holds) with the handler
in `refining/controller.ts` (that domain owns the tables) — the split
ruling 26b already prescribes.

### 4.2 Contracts

Every one derives from a generated entity schema with `pick`/`extend`/`shape`
(`lint:contracts-derived`; no `z.string()` leaf below the generated region).

| contract | derivation |
|---|---|
| `Lot` | generated from `lots.items` |
| `CheckoutLot` | generated from `checkout.lots` |
| `OrderLot` | generated from `orders.lots` |
| `RefiningOrder`, `RefiningLot`, `PoolEntry` | generated from their tables |
| `CheckoutLotPatch` | `z.union([CheckoutBullionLot, CheckoutScrapLot])`, both `.strict()` — exactly today's `CheckoutItemPatch` shape (ruling 80), with `Lot.pick` in place of `CheckoutItem.pick` |
| `CheckoutBullionLot` | `Lot.pick({ bullion_id: true, quantity: true }).strict()` |
| `CheckoutScrapLot` | `Lot.pick({ metal_id, pre_melt, post_melt, purity, unit, quantity }).strict()`, the four load-bearing values non-null |
| `OrderLotPatch` | `OrderLot.pick({ premium, sales_tax_charged, confirmed }).merge(Lot.pick({ pre_melt, post_melt, purity, unit, quantity })).partial().strict()` |
| `OrderLotView` | `OrderLot.extend({ lot: Lot, product_name, item_name, payable, line_total, settled })` |
| `RefiningOrderCreate` | `RefiningOrder.pick({ refiner_id: true, direction: true })` |
| `RefiningOrderPatch` | `RefiningOrder.pick({ fee, statement_reference, refiner_id }).partial().strict()` |
| `RefiningLotPatch` | `RefiningLot.pick({ pre_melt, post_melt, purity, unit, premium }).partial().strict()` |
| `RefiningSettlement` | `RefiningOrder.pick({ fee, statement_reference }).extend({ lots: z.array(RefiningLotPatch.extend({ lot_id: Lot.shape.id })) })` |
| `RefiningOrderView` | `RefiningOrder.extend({ refiner: RefinerView.nullable(), lots: z.array(RefiningLotView), pool: z.array(PoolBalance) })` |
| `RefiningLotView` | `RefiningLot.extend({ lot: Lot, order_number, customer_premium })` |
| `PoolBalance` | `PoolEntry.pick({ refiner_id, metal_id }).extend({ troy_oz, last_lock_price })` |
| `PoolLockCreate` | `PoolEntry.pick({ refiner_id, metal_id, troy_oz, lock_price, refining_order_id })` |

`OrderItem`, `OrderViewItem`, `OrderItemPatch`, `OrderItemWrite`,
`CheckoutItem`, `CheckoutItemPatch`, `RefinerItem`, `RefinerItemPatch`,
`RefinerOrder`, `RefinerOrderPatch`, `RefinerOrderView`, `RefinerSpot` and
`SoldLinePrice` are deleted.

### 4.3 Views — one SQL read each (ruling 71)

**`OrderView.lots`** replaces `OrderView.items`. The subselect in
`db/orders/sql/view.sql`, with the `products.bullion` scalar kept (ruling 80: a
product name is load-bearing for a document, the rest is flair):

```sql
COALESCE((
  SELECT jsonb_agg(
           to_jsonb(ol)
           || jsonb_build_object(
                'lot',      to_jsonb(li),
                'product_name',
                  (SELECT b.name FROM products.bullion b WHERE b.id = li.bullion_id),
                'item_name',
                  CASE WHEN li.bullion_id IS NULL
                       THEN li.metal_id || ' Item '
                            || row_number() OVER (PARTITION BY li.metal_id
                                                      ORDER BY ol.id ASC)
                       END,
                'payable',
                  CASE WHEN li.content IS NULL OR ol.premium IS NULL THEN NULL
                       ELSE li.content * ol.premium END,
                'line_total',
                  CASE WHEN ol.price IS NULL THEN NULL
                       WHEN li.bullion_id IS NULL THEN ol.price
                       ELSE ol.price * li.quantity END,
                'settled',
                  EXISTS (SELECT 1 FROM refining.lots rl
                           WHERE rl.lot_id = ol.lot_id
                             AND rl.settled_at IS NOT NULL))
           ORDER BY ol.id ASC)
    FROM orders.lots ol
    JOIN lots.items li ON li.id = ol.lot_id
   WHERE ol.order_id = o.id), '[]'::jsonb) AS lots
```

plus, on the order object itself, the payable predicate from section 1.5.

**`RefiningOrderView`** — the refiner, its lots with the customer's side of
each, and the pool balance for that refiner:

```sql
SELECT to_jsonb(ro)
       || jsonb_build_object(
            'created_at', to_char(ro.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'updated_at', to_char(ro.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'refiner',
              (SELECT jsonb_build_object('id', r.id, 'logo', r.logo,
                        'organization', jsonb_build_object('id', og.id, 'name', og.name,
                          'email', og.email, 'phone', og.phone, 'enabled', og.enabled))
                 FROM refiners.refiners r
                 JOIN organizations.organizations og ON og.id = r.organization_id
                WHERE r.id = ro.refiner_id),
            'lots', COALESCE((
              SELECT jsonb_agg(
                       to_jsonb(rl)
                       || jsonb_build_object(
                            'lot', to_jsonb(li),
                            'order_number',      od.number,
                            'customer_premium',  ol.premium,
                            'settled_at', to_char(rl.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                       ORDER BY li.metal_id ASC, rl.id ASC)
                FROM refining.lots rl
                JOIN lots.items   li ON li.id = rl.lot_id
                LEFT JOIN orders.lots ol ON ol.lot_id = rl.lot_id
                LEFT JOIN orders.orders od ON od.id = ol.order_id
               WHERE rl.refining_order_id = ro.id), '[]'::jsonb),
            'pool', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'refiner_id', p.refiner_id, 'metal_id', p.metal_id,
                       'troy_oz', sum(p.troy_oz),
                       'last_lock_price',
                         (SELECT lk.lock_price FROM refining.pool lk
                           WHERE lk.refiner_id = p.refiner_id
                             AND lk.metal_id = p.metal_id
                             AND lk.entry = 'lock'
                           ORDER BY lk.occurred_at DESC, lk.id DESC LIMIT 1))
                       ORDER BY p.metal_id)
                FROM refining.pool p
               WHERE p.refiner_id = ro.refiner_id
               GROUP BY p.refiner_id, p.metal_id), '[]'::jsonb)) AS view
  FROM refining.orders ro
 WHERE ro.id = $1
```

**`PoolView`** is the `GROUP BY` above with no order filter, keyed by
`?refiner_id=&metal_id=`.

---

## 5. Pricing and profit

The rule that must survive: one SQL read per number (rulings 71/78), the public
surface unchanged at five functions (`priceCheckout`, `priceOrder`,
`priceProduct`, `spots`, `profitBreakdown`), zero TypeScript that multiplies
money outside `api/pricing/**` (`lint:pricing-owner`).

Every change below is confined to the `lines` CTE of four SQL files. Nothing
downstream of `lines` moves, which is the point of the shape.

### 5.1 `purchase_quote.sql`

```sql
lines AS (
  SELECT cl.id,
         li.bullion_id,
         li.metal_id,
         COALESCE(li.content, 0)  AS content,
         li.quantity,
         s.bid AS bid,
         CASE WHEN li.bullion_id IS NULL
              THEN COALESCE(li.content, 0)
              ELSE COALESCE(li.content, 0) * li.quantity END AS weighed
    FROM checkout.lots cl
    JOIN lots.items li ON li.id = cl.lot_id
    JOIN checkout ON checkout.id = cl.checkout_id
    LEFT JOIN spots.spots s ON s.metal_id = li.metal_id
)
```

Three consequences, all deliberate:
- `stored_premium` is gone, so `priced.premium` is `COALESCE(band_pct, 0)`
  instead of `COALESCE(band_pct, stored_premium, 0)`. The band already won in
  every branch; the fallback only ever fired when a metal had no `rates.rates`
  row at all, and then a stored premium the same quote had written a moment ago
  was the value. It is the quote quoting itself.
- `COALESCE(ci.quantity, 1)` is gone: `quantity` is NOT NULL.
- `content` is the generated column, so the quote and the order agree by
  construction rather than by both calling `fineContent`.

### 5.2 `order_pricing.sql`

```sql
lines AS (
  SELECT ol.id,
         li.bullion_id,
         li.metal_id,
         COALESCE(li.content, 0) AS content,
         li.quantity,
         ol.premium AS stored_premium,
         ol.price   AS stored_price,
         CASE WHEN ord.spots_locked THEN os.bid ELSE s.bid END AS bid,
         CASE WHEN li.bullion_id IS NULL
              THEN COALESCE(li.content, 0)
              ELSE COALESCE(li.content, 0) * li.quantity END AS weighed
    FROM orders.lots ol
    JOIN lots.items li ON li.id = ol.lot_id
    JOIN ord ON ord.id = ol.order_id
    LEFT JOIN orders.spots os ON os.order_id = ol.order_id AND os.metal_id = li.metal_id
    LEFT JOIN spots.spots  s  ON s.metal_id = li.metal_id
)
```

`metal_spots` swaps `orders.items` for the same two-table join. Everything after
`lines` — `by_metal`, `tiered`, `priced`, `lined`, `totals`, `carriage`,
`payout` — is untouched, and `stored_price`/`source` keep working **because
`orders.lots.price` exists**. Without it the `'stored'` branch is dead and
`finalizePricing` has nowhere to write, which is question 6.

### 5.3 `sale_quote.sql`

```sql
lines AS (
  SELECT cl.id, li.bullion_id, li.metal_id, li.quantity,
         li.content, li.purity, li.pre_melt,
         b.id AS product_id, b.type AS product_type, b.ask_premium,
         b.legal_tender, b.domestic_tender,
         COALESCE(li.content, 0) * (COALESCE(s.ask, 0) * COALESCE(b.ask_premium, 0))
           AS unit_ask
    FROM checkout.lots cl
    JOIN lots.items li ON li.id = cl.lot_id
    JOIN checkout ON checkout.id = cl.checkout_id
    LEFT JOIN products.bullion b ON b.id = li.bullion_id
    LEFT JOIN spots.spots s ON s.metal_id = li.metal_id
)
```

The `products.bullion` join stays (ruling 80: a sale line prices at the
product's live `ask_premium`, and the tax rule matches its `type` and tender
flags). The sales-tax LATERAL, the settlement CTE and the surcharge are
untouched.

### 5.4 `profit_breakdown.sql`

Three CTEs change and the rest of the 227 lines do not.

```sql
assay AS (
  SELECT rl.lot_id, rl.content, rl.premium, rl.refining_order_id
    FROM refining.lots rl
    JOIN orders.lots ol ON ol.lot_id = rl.lot_id
   WHERE ol.order_id = $1::uuid
),
lines AS (
  SELECT ol.id,
         li.metal_id,
         (li.bullion_id IS NULL) AS is_scrap,
         CASE WHEN li.bullion_id IS NULL THEN COALESCE(li.content, 0)
              ELSE COALESCE(li.content, 0) * li.quantity END AS base_content,
         ol.premium AS dorado_premium,
         a.premium  AS refiner_premium,
         CASE WHEN li.bullion_id IS NULL THEN a.content END AS assayed_content
    FROM orders.lots ol
    JOIN lots.items li ON li.id = ol.lot_id
    JOIN metals.metals m ON m.id = li.metal_id
    LEFT JOIN assay a ON a.lot_id = ol.lot_id
   WHERE ol.order_id = $1::uuid
),
-- The refiner's feed. refiners.spots is gone: Dorado's and the refiner's
-- ounces are valued at the price the metal actually changed hands at - the
-- most recent lock for that refiner and metal at or before the settlement -
-- and at the live bid when there has been no lock.
refiner_spot AS (
  SELECT DISTINCT ON (p.metal_id)
         p.metal_id,
         COALESCE(p.lock_price, s.bid) AS bid
    FROM assay a
    JOIN refining.orders ro ON ro.id = a.refining_order_id
    LEFT JOIN refining.pool p
           ON p.refiner_id = ro.refiner_id
          AND p.entry = 'lock'
          AND p.occurred_at <= COALESCE(ro.settled_at, now())
    LEFT JOIN spots.spots s ON s.metal_id = p.metal_id
   ORDER BY p.metal_id, p.occurred_at DESC, p.id DESC
)
```

`a.post_melt * a.purity` disappears from `assayed_content` because
`refining.lots.content` is generated from exactly that. `order_spot` is
unchanged: the customer is valued at `orders.spots.bid`, frozen, forever.

`split`, `owned`, `per_metal`, `shares`, `spot_net`, `fees`, `metals_profit`
and `parties` are byte-identical. The closed form
`customer = d, dorado = max(r-d,0), refiner = 1-max(d,r)` is untouched, and so
is the four-case test file. **The one behavioural change is which number prices
Dorado's and the refiner's ounces**, and it is question 9.

### 5.5 The payout quote

`purchase_quote.sql`'s `estimated_payout` is `total - payout_charge` and reads
no item table beyond `lines`, so it changes with `lines` and in no other way.
`payments.methods.flat_fee` is still the fee and `shipping.services
.max_insured_value` is still the ceiling.

---

## 6. Two worked examples

Every number cites the column it comes from. Rates, spots and product rows are
written out so the arithmetic can be checked by hand.

### 6.1 A mixed purchase order

**The catalogue and the reference rows**

| row | columns |
|---|---|
| product P | `products.bullion` — `name` "1 t oz .999 Gold Bar", `gross` 1.0000, `purity` 0.9990, `content` 0.9990, `metal_id` 'Gold' |
| band G1 | `rates.rates` — `metal_id` 'Gold', `min_qty` 5, `max_qty` 10, `scrap_pct` 0.900, `bullion_pct` 0.950 |
| band S1 | `rates.rates` — `metal_id` 'Silver', `min_qty` 50, `max_qty` 200, `scrap_pct` 0.850, `bullion_pct` 0.930 |
| method W | `payments.methods` — `type` 'WIRE', `flat_fee` 20.00 |

**Mint (checkout).** Three `lots.items` rows, three `checkout.lots` rows.

| lot | `bullion_id` | `metal_id` | `unit` | `quantity` | `pre_melt` | `post_melt` | `purity` | `content` (generated) |
|---|---|---|---|---|---|---|---|---|
| A | null | Gold | t oz | 1 | 10.0000 | — | 0.9000 | **9.000000** |
| B | null | Silver | t oz | 1 | 100.0000 | — | 0.9250 | **92.500000** |
| C | P | Gold | t oz | 2 | 1.0000 | — | 0.9990 | **0.999000** |

Lot C's `pre_melt` is `products.bullion.gross` and its `purity` is
`products.bullion.purity`; `post_melt` is NULL and `content` comes out at
`gross x purity = 0.999000`, which is `products.bullion.content`. That identity
is the migration gate in section 7.

**Place.** `checkout.lots` rows are deleted, `orders.lots` rows inserted with
the same `lot_id`. `orders.spots` freezes `Gold bid 2400.00`, `Silver bid
30.00`.

Rate band: the order's gold ounces are `9.000000` (lot A is scrap; the band for
a purchase is earned by the whole order's ounces in that metal), which lands
inside G1. Silver is `92.500000`, inside S1.

| lot | `orders.lots.premium` | source | `payable` = `content x premium` |
|---|---|---|---|
| A | 0.900 | G1 `scrap_pct` | 9.000000 x 0.900 = **8.100000 oz** priced at 2400 -> **19,440.00** |
| B | 0.850 | S1 `scrap_pct` | 92.500000 x 0.850 = 78.625000 oz at 30 -> **2,358.75** |
| C | 0.950 | G1 `bullion_pct` | 0.999000 x 0.950 = 0.949050 oz at 2400 x 2 pieces -> **4,555.44** |

`items_total` = 19,440.00 + 2,358.75 + 4,555.44 = **26,354.19**
(`order_pricing.sql` `totals`).
`shipping_charge` = `shipping.shipments.cost` of the inbound parcel = **25.00**.
`payout_fee` = `orders.transactions.payout_fee` = method W's `flat_fee` =
**20.00**.
`total` = 26,354.19 - 25.00 - 20.00 = **26,309.19**.

That is what the customer is paid, and nothing below changes it.

**Received, confirmed.** The parcel arrives, the admin weighs it, the declared
weights hold, all three `orders.lots.confirmed` go true.
`finalizePricing` locks `orders.orders.spots_locked` and writes
`orders.lots.price` — 19,440.00 / 2,358.75 / 2,277.72 per piece.

**Split into two refining orders.**

| refining order | `direction` | `refiner_id` | lots |
|---|---|---|---|
| #1001 | sell | R1 | A, C |
| #1002 | sell | R2 | B |

One customer order, two refiners. `refiners.orders.order_id` cannot express
this and that is the whole reason for the change.

**Assay and settlement of #1001.**

| `refining.lots` | `pre_melt` | `post_melt` | `purity` | `content` | `premium` |
|---|---|---|---|---|---|
| lot A | 10.0000 | 10.0000 | 0.9000 | **9.000000** | 0.950 |
| lot C | 1.0000 | — | 0.9990 | **0.999000** | 0.980 |

`refining.orders` #1001: `fee` 7.00, `statement_reference` 'R1-2026-09-14',
`sent_at` 2026-09-10, `settled_at` 2026-09-14.

Pool credits, written in the same transaction — what the refiner now owes
Dorado is `content x premium`, per piece x quantity:

| `refining.pool` | `entry` | `metal_id` | `troy_oz` | cites |
|---|---|---|---|---|
| 1 | credit | Gold | 9.000000 x 0.950 = **8.550000** | #1001 |
| 2 | credit | Gold | 0.999000 x 0.980 x 2 = **1.958040** | #1001 |

R1 gold balance = **10.508040 t oz** (`sum(troy_oz)`).

**Settlement of #1002.** Lot B assayed at `post_melt` 100.0000, `purity` 0.9250
-> `content` 92.500000, `premium` 0.920. Credit to R2: 92.500000 x 0.920 =
**85.100000 t oz** of Silver. `fee` 4.00.

**Payable.** After #1002 settles, no `orders.lots` row on the order has a scrap
lot without a settled `refining.lots` row, so the `NOT EXISTS` is true and the
order is payable. Lot C never needed a settled row: it is bullion, and it was
payable when `confirmed` went true.

**A lock.** Dorado takes 10 t oz of gold out of R1's pool at 2450.00 to fill a
sales order:

| `refining.pool` | `entry` | `metal_id` | `troy_oz` | `lock_price` | cites |
|---|---|---|---|---|---|
| 3 | lock | Gold | **-10.000000** | 2450.00 | #2001 (a `buy` order) |

R1 gold balance = 10.508040 - 10.000000 = **0.508040 t oz**. Cash value of the
lock = `-troy_oz x lock_price` = **24,500.00**, derived, not stored.

**Profit (`profit_breakdown.sql`).** Take lot A. `d` = `orders.lots.premium`
0.900, `r` = `refining.lots.premium` 0.950.

- `customer` share = d = 0.900; `dorado` = max(0.950 - 0.900, 0) = 0.050;
  `refiner` = 1 - max(0.900, 0.950) = 0.050. Sum 1.000.
- customer ounces come off the DECLARED weight: 9.000000 x 0.900 = **8.100000**.
- refiner ounces come off the ASSAY basis 9.000000: x 0.050 = **0.450000**.
- dorado = 9.000000 - 8.100000 - 0.450000 = **0.450000**.
- The customer's 8.100000 oz is valued at `orders.spots.bid` 2400 =
  **19,440.00** — the same number the order pays, which is the check that the
  two feeds never mix.
- Dorado's and the refiner's ounces are valued at R1's last lock price 2450.00:
  dorado **1,102.50**, refiner **1,102.50**.
- Dorado's `spot_net` = 8.100000 x (2450 - 2400) = **405.00**, the gap between
  the feeds over the ounces the customer was paid for.

### 6.2 A sales order of bullion

**Rows.** Product P again (`ask_premium` 1.040, `type` 'Bar', `legal_tender`
false). `spots.spots` Gold `ask` 2410.00. `shipping.services.price` 25.00.
`payments.methods` CARD `surcharge_percent` 0.029.
`tax.sales_tax_rules` for the delivery state: `tax_rate` 0.0575, `metal_category`
'All', `product_type` 'All'.

**Mint.** One `lots.items` row: `bullion_id` P, `metal_id` Gold, `unit` 't oz',
`quantity` 2, `pre_melt` 1.0000, `post_melt` NULL, `purity` 0.9990, `content`
**0.999000**. One `checkout.lots` row. A sale line is a lot (question 4): there
is one line table, and a second would bring back the sprawl this removes.

**Quote (`sale_quote.sql`).**

| number | column | value |
|---|---|---|
| `unit_ask` | `content x (spots.ask x bullion.ask_premium)` | 0.999000 x (2410.00 x 1.040) = 0.999000 x 2506.40 = **2,503.89** |
| `item_total` | `sum(unit_ask x quantity)` | 2,503.89 x 2 = **5,007.79** |
| `sales_tax` | `item_total x rule.tax_rate` | 5,007.79 x 0.0575 = **287.95** |
| `shipping` | `shipping.services.price` | **25.00** |
| `surcharge` | `(5,007.79 + 287.95 + 25.00) x methods.surcharge_percent` | 5,320.74 x 0.029 = **154.30** |
| `total` | | **5,475.04** |

**Place.** `orders.lots` gets `premium` 1.040 (`ask_premium`, frozen),
`price` 2,503.89, `sales_tax_charged` 287.95, `confirmed` true.
The `lot_id` is the same row the basket held.

**Supply.** `POST /api/orders/:id/supply { refiner_id: R1 }` opens
`refining.orders` #2001, `direction` 'buy', assigns the lot, sends it, and
emails R1 after the commit. `refining.lots` for the lot: `premium` 1.010 —
Dorado pays R1 101% of spot.

Cost = `content x (ask x premium) x quantity` = 0.999000 x (2410.00 x 1.010) x 2
= 0.999000 x 2434.10 x 2 = **4,863.33**.
Metal margin = 5,007.79 - 4,863.33 = **144.46**.

**The pool.** #2001 was filled from R1's pool, so it wrote the lock in 6.1
(entry 3, -10.000000 oz at 2450.00). A buy order paid in cash writes no pool
entry at all; the presence of a lock citing the order is what says which it was.
No `credit` is ever written by a `buy` order: Dorado receives metal, not a
claim.

---

## 7. What dies, and the migration path

### 7.1 What dies

**Tables** (dropped last, one release after the reads move):
`orders.items`, `checkout.items`, `refiners.items`, `refiners.orders`,
`refiners.spots`.

**Columns**: `orders.transactions.refiner_fee`, `.pool_oz_deducted`,
`.pool_remediation` — the first becomes `refining.orders.fee`, the other two
become pool entries. `orders.spots` and `orders.addresses` stay untouched.

**Code**: `api/orders/refiners/**` (11 files) moves to `api/refining/**` and is
rewritten from the inputs inward (ruling 78) — `engagementIdFor`,
`mirrorForOrder`, `mirrorLinesForOrder` and both `mirror_for_order.sql` reads
have no subject once a refining order is not per customer order.
`api/db/orders/items/**`, `api/db/checkout/items/**`, `api/db/refiners/items/**`,
`api/db/refiners/orders/**`, `api/db/refiners/spots/**` are replaced by
`db/lots/items`, `db/checkout/lots`, `db/orders/lots`, `db/refining/*`.
`shared/utils/convertWeights.ts` `fineContent` dies with the generated column;
`convertTroyOz` and `convertToPounds` stay (parcel weights).
`orders/refiners/items/rules.ts` `assayedRow` — a read-modify-write in
TypeScript that exists to recompute `content` — dies with it.

**Routes**: the seven listed in section 4.1.

**Contracts**: the thirteen listed in section 4.2.

### 7.2 The steps

Each is one migration, additive, `exchange` untouched throughout. Numbering
starts at **134** (133 is the last applied).

1. **134** — `CREATE SCHEMA lots`, `CREATE SCHEMA refining`, the six tables, the
   two enums, the sequence, the indexes and the CHECKs. Register `audit_stamp`
   on all six (the 116 pattern). Empty. Additive.
   The trigger may be registered here rather than after the backfills, because
   116's insert branch COALESCEs `created_at`/`updated_at` rather than assigning
   them — step 2 supplies both and they survive.
2. **135** — backfill `lots.items` from `orders.items`, **id preserved**, 88
   rows; then `orders.lots` from the same rows. Every existing item id keeps its
   key, so nothing that cites one breaks.
3. **136** — backfill `lots.items` + `checkout.lots` from `checkout.items`, ids
   preserved. 3 rows, disposable either way (`checkout.*` is device-sync, not a
   ledger).
4. **137** — backfill `refining.orders` from the `refiners.orders` rows that
   carry a `refiner_id`, `direction` derived from the customer order's own
   direction (`purchase` -> `sell`, `sale` -> `buy`); then `refining.lots` from
   their `refiners.items`, with `lot_id = order_item_id`, which is a
   `lots.items` id after step 2.
5. **138** — backfill `refining.pool`: one `credit` and one `lock` per
   `refiners.orders.pool_oz_deducted`, citing that order.
   `refiners.orders.fee` lands on `refining.orders.fee` in step 4, not here.
6. **139** — views and contracts. `OrderView` reads lots; `RefiningOrderView` is
   added; `validate:wire` proves every shape against live rows.
7. Code only, no migration — reads and writes switch to the new tables. Reverts
   by reverting code.
8. **140** — drop the five tables. LAST, its own migration, one release after
   the reads moved. Native schemas, not `exchange`, so `lint:migrations` allows
   it and the covenant is untouched.

Steps 1-6 add only. Step 7 reverts by reverting code. Step 8 is the one one-way
door and every row it drops was copied in steps 2-5.

### 7.3 The gate that step 2 must pass

The migration drops a STORED `content` and replaces it with a GENERATED one.
Two ways that silently changes a historic number, both measured before 135 runs:

**a. Bullion.** `checkout/items/sql/create_from_product.sql` and
`orders/items/sql/create_from_product.sql` write `post_melt = b.content` and
`purity = b.purity` and `content = b.content`. A generated
`post_melt x purity` would apply purity TWICE — a 0.1% to 8.3% understatement
on every bullion line ever placed. The fix is in the model: a product lot has
`post_melt` NULL (the CHECK enforces it) and its content is `gross x purity`.
That reproduces `products.bullion.content` only if the catalogue is internally
consistent, so:

```sql
SELECT count(*) FROM products.bullion
 WHERE abs(content - gross * purity) > 1e-9;   -- must be 0 before 135 runs
```

**b. Scrap.** `checkout/rules.ts` `scrapLine` computes content from
**`pre_melt`**, while `orders/refiners/items/rules.ts` `assayedRow` computes it
from `post_melt ?? pre_melt`. The generated column uses the second. A scrap lot
that declares a post-melt weight therefore gets a different content than it has
today. That is the correct definition and the inconsistency is the defect, but
it is a value change on live rows, so:

```sql
SELECT count(*) FROM orders.items
 WHERE bullion_id IS NULL AND post_melt IS NOT NULL AND post_melt <> pre_melt;
```

Every such row is listed in the migration header with both numbers.

**The migration then asserts the whole population**: for all 88 rows,
`abs(lots.items.content - orders.items.content) <= 1e-9` except the rows named
above, and it refuses to commit otherwise. A backfill that changes a price is a
backfill that must say so.

### 7.4 How `verify:backfill` declares it

`api/scripts/verify-backfill.mjs` needs six new entries. The declarations, in
its own vocabulary:

| table | declaration | reason string |
|---|---|---|
| `lots.items` | `population`: the `orders.items` + `checkout.items` ids `exchange` can produce | rows minted natively after the pivot are out of scope, same as `orders.items` today |
| `lots.items` | `rebuildDiffers`: `content` | generated from the rebuild's own inputs; comparing it asserts the generator twice |
| `orders.lots` | `population`: as `orders.items` | same population, same key |
| `orders.lots` | `native`: `confirmed`, `premium`, `price` | the admin drawer writes all three after placement, as it does on `orders.items` today (bucket 20 of the honesty pass) |
| `checkout.lots` | `absentInDev` allowed | 3 rows, device-sync, no ledger value |
| `refining.orders` | `population`: `exchange.purchase_orders` + `exchange.sales_orders` with a supplier | derived from the same source `refiners.orders` is |
| `refining.lots` | `population`: `exchange.refiner_metals` / the scrap rows | as `refiners.items` |
| `refining.pool` | `mintedByRebuild`: two rows per `pool_oz_deducted` | the credit/lock pair the rebuild derives from one legacy column; the SQL says how many such rows `exchange` justifies |

`scripts/lib/feature-map.ts` gains, before step 8, or `audit:coverage` reports
`exchange` columns with nowhere to go:

```
orders:  "exchange.purchase_order_items": ["lots.items", "orders.lots", "refining.lots"]
         "exchange.sales_order_items":    ["lots.items", "orders.lots"]
         "exchange.scrap":                ["lots.items", "orders.lots", "refining.lots"]
checkout:"exchange.cart_items":           ["lots.items", "checkout.lots"]
         "exchange.sell_cart_items":      ["lots.items", "checkout.lots"]
refining:"exchange.refiner_metals":       ["refining.lots", "refining.pool"]
         "exchange.purchase_orders":      ["refining.orders"]
```

and a `FLOWS` entry, because the product's weights flow into a table that does
not own them:

```
lots: { "exchange.products": { "lots.items": { gross: "pre_melt", purity: "purity" } } }
```

Note what is NOT in that flow any more: `content` maps to nothing, because it is
generated. Today's entry (`content: ["post_melt", "content"]`) is exactly the
double-purity defect written down as a mapping, and removing it is the fix.

`audit:indexes` and `audit:query-paths` both need a pass after step 6: every
`WHERE` in the new repos filters on `lot_id`, `order_id`, `refining_order_id` or
`(refiner_id, metal_id)`, and section 1 gives each a leading index. `audit:
enum-domains` gains two enums (`refining.direction`, `refining.pool_entry`),
neither compared against a text column anywhere.

### 7.5 Production day, and ruling 82

**This chain runs AFTER the production sequence in CLAUDE.md, never inside it.**

Ruling 82 settles the open question the 2026-09-06 handoff left: production's
January native schemas are **dropped and rebuilt from genesis plus the
backfills**, rather than repaired in place. That decision helps this chain twice
and complicates it once.

- **It removes the interaction that would have been fatal.** Under
  repair-in-place, production's `orders.items` holds January residue, and the
  `exchange` backfills that fix it WRITE `orders.items` — the table step 8
  drops. Sequencing that is a knife-edge. Under drop-and-rebuild, `orders.items`
  is created empty by genesis, filled by 031 from `exchange`, and then read by
  135. The lots chain becomes an ordinary set of migrations against real
  history.
- **It fixes findings 2, 3, 4, 5 and 7 of the UAT rehearsal for free** — the
  missing `gen_random_uuid()` defaults, the seven tables foreign-keyed to
  `core`, the 25 `timestamp`-not-`timestamptz` columns, and the shipments 048's
  check refused. All of them are the `002-049` baseline stamp skipping repairs
  on schemas that already existed. Dropping the schemas means nothing already
  exists.
- **It makes the drop list longer, and the covenant still governs it.** The
  drop is of NATIVE schemas holding derived residue. `exchange` is not touched,
  is not the subject of any statement, and remains the source every backfill
  reads. `lint:migrations` sees no `exchange` write, so no
  `-- allow-destructive:` marker is required by the linter — and one should be
  written anyway, naming the `pg_dump` it depends on, because a marker is a
  sentence about a backup and this is the step that needs one most.

So the whole order, on the day, is: `pg_dump` (owner role — the read-only role
cannot, finding 1) -> drop the ten January native schemas -> genesis ->
001-133 -> the `exchange` backfills -> 047 seeds -> `verify:parity`,
`verify:backfill`, `compare:databases` -> merge. **Then** 134-140, as ordinary
migrations. Never before, and not by an agent.

Two production facts that bite this chain specifically and are recorded, not
raised as blockers:

- `products.bullion` must be populated and self-consistent before 135, because
  section 7.3's gate reads it. Finding 5 of the rehearsal is that 029 was
  leaving it EMPTY; that is fixed, and the gate would have caught it again.
- The `metals.metals` text-id FKs (ruling 79) cannot be added to production's
  January `uuid` columns — the F6 crop recorded in the production-day lane.
  Drop-and-rebuild removes that too, and `lots.items.metal_id text` depends on
  it having been removed.

---

## 8. For Jacob

### The five that were already open

1. **Does a bullion lot get assayed?** — **No.** The code already refuses it
   (`assertScrapLine`), and 68 of dev's 88 refiner rows mirror bullion for
   nothing. A bullion lot may join a refining order; its assay columns stay
   null and the settlement is the premium and the fee. Encoded as
   `a_product_lot_is_not_melted`.
   *If yes*: drop that CHECK, and `profit_breakdown.sql`'s `assayed_content`
   loses its `is_scrap` guard. Costs nothing structurally; it just stops the
   database enforcing a rule the code already has.

2. **Can a lot be split after minting?** — **No split in place.** A split mints
   new lots and sets `split_from_id`. The id must survive to the refiner;
   rewriting a lot's quantity breaks the one thing the model is for.
   *If in place*: `lot_id UNIQUE` on `refining.lots` becomes a lie the moment
   half a lot goes to a second refiner, and the profit report has no stable
   denominator. This is the recommendation I would defend hardest.

3. **Pool per refiner per metal, or per refiner order?** — **Per refiner per
   metal.** It is a running balance, not an event. Every entry cites its
   refining order when it has one, so the per-order view is a `WHERE` away.
   *If per order*: the balance becomes a column somebody has to keep correct,
   which is `pool_oz_deducted` again, and a lock that spans two settlements has
   nowhere to sit.

4. **Do sales orders use lots?** — **Yes.** `orders.lots` is the only line
   table, so a sale line is a lot: bullion, quantity N, no assay. 35 of dev's
   88 lines are sale lines.
   *If no*: a second line table, a second set of contracts, a second branch in
   `order_pricing.sql`, and the three-table sprawl this removes comes back with
   one table renamed.

5. **Payable on EVERY lot, or every lot that needs refining?** — **Every lot
   that needs refining.** If bullion never reaches a refiner, "every lot
   settled" is never true for a mixed order and nothing is ever payable. A
   bullion lot is settled when `confirmed`.
   *If every lot*: every mixed order needs a dummy settled `refining.lots` row
   for its bullion, which is 68 of dev's 88 rows existing for nothing — the
   exact waste question 1 removes.

### The seven this write-up surfaced

6. **Where does the frozen line price live?** — **`orders.lots.price`.**
   `finalizePricing` writes a per-unit price today and `order_pricing.sql` reads
   it back as `stored_price`, reporting `source = 'stored'`. The previous draft
   had no column for it, which would have silently deleted the distinction
   between a quoted order and a finalised one.
   *If it does not exist*: `priceOrder` re-derives every historic order at
   today's premium, and an admin's hand-edited price is lost on the next read.

7. **Does `refining.orders` carry a direction?** — **Yes: `sell` and `buy`.**
   `sendToRefiner` is a SALE-side action — Dorado orders bullion FROM a supplier
   to fill a customer's sales order — and it writes `refiners.orders` today. The
   previous draft dropped those 34 rows as "shadows recording nothing"; they
   record the supplier engagement on every sales order the business has sent.
   *If no*: the sale-side supplier flow needs its own table, and the pool lock
   that funds it cannot cite the order it fills.

8. **Is `content` a generated column, or an expression in each read?** —
   **Generated.** One definition, in the database, indexable, and impossible for
   two reads to disagree about. It also kills `fineContent` and `assayedRow`.
   *If an expression*: the `CASE lower(unit)` block is copied into five SQL
   files and the TypeScript helper stays alive for the writers, which is the
   dictionary in another spelling.

9. **What prices Dorado's and the refiner's ounces once `refiners.spots`
   dies?** — **The most recent `lock` price for that refiner and metal at or
   before the settlement, falling back to `spots.spots.bid`.** `refiners.spots`
   is a hand-entered per-order table with 261 dev rows and no writer but the
   admin drawer; the lock price is the number the metal actually changed hands
   at.
   *If not*: keep a bid column on `refining.orders` per metal, which is
   `refiners.spots` with a new name, or value both parties at the live feed,
   which makes yesterday's profit report change overnight. **This is the one
   recommendation that changes a reported number** — `profit_breakdown`'s
   `dorado.spot_net` and both non-customer valuations move — so it wants a
   before/after on a real order before it lands.

10. **Is the refiner fee cash or pool?** — **Cash: `refining.orders.fee`, and
    the pool has no `fee` entry type.** One number in one place.
    *If a refiner deducts its fee in metal*: it is a `lock` at the agreed price,
    which the enum already expresses. Nothing needs to change.

11. **Does the checkout lot keep a premium column?** — **No.** Nothing reads it:
    `purchase_quote.sql` prefers the band, `sale_quote.sql` reads the product,
    and `create_sold.sql` takes the premium from the quote. The write that fills
    it is the quote quoting itself.
    *If yes*: it is a cache of a live number, and it will go stale between the
    basket and placement, which is the class of bug the quotes lane closed.

12. **The bullion snapshot writes `post_melt = products.bullion.content` beside
    `purity`, so a derived content applies purity twice.** The model fixes it by
    making `post_melt` NULL on a product lot, and section 7.3 gates it on
    `content = gross x purity` across all 62 catalogue rows.
    *If the catalogue is NOT self-consistent*: the gate fails, and the answer is
    to fix the two or three products before 135 runs, not to store the content.
    **This one is not really a question — it is a defect the write-up found —
    but it needs Jacob to know a historic number could have moved.**
