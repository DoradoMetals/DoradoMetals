# The Inventory tab — model and screens (2026-10-09)

Jacob: "We have the following: Lots, On Hand, Pool. Seems like we'll need
three different screens… lots come from orders but either take/give to on-hand
and take/give to pool. We probably need screens showcasing what all makes up
past current pool/on-hand per metal." Pool lives under Inventory. This doc is
the ruling the Inventory design file (`ZgJF9JWNY6BwxmWABRZ6I7`) builds from.

## 1. The model in one page

Everything below is already how the API works (`docs/waves/lot-model.md`,
`docs/waves/pool-spot.md`). Nothing new is stored for these screens; every
number is a read.

**A lot** is metal we own, minted from a purchase order's line. It carries
weight, purity, content (fine oz, generated), premium. Its **position** is
derived from timestamps and lineage, never stored:

| position | meaning | enters by | leaves by |
|---|---|---|---|
| Incoming | on a purchase order whose inbound handover is not done | order placed | handover done → On hand |
| On hand | physically ours, on no refiner order | arrival; split/combine result | batch → At refiner; sale → Sold; split/combine → Consumed |
| At refiner | batched into a sent, unsettled refiner order | batch | settlement → Pooled (if pooled) or leaves the books (if paid) |
| Pooled | its refiner order settled as `pooled` | settlement | never moves again; its ounces now live in the pool ledger |
| Sold | a sale edge names it, or it sits on a sale order | sale | terminal |
| Consumed | a split or combine edge names it as a source | split/combine | terminal; its content lives on in the children |

**The pool** (`inventory.pool`) is one append-only ledger per refiner, in fine
ounces, per metal. Two entry kinds:

- **Credit**: a pooled settlement credits the refiner's assayed fine oz. The
  credit carries `spot`, the weighted average of the settled lots' own
  `settled_spot`.
- **Lock**: ounces leave. `troy_oz` negative, `lock_price` (the price the
  ounces were priced at), `purpose` (source a sale · sell to the refiner for
  cash), optional `lot_id` when it sources a sale lot, and `basis_spot`
  snapshotted at the instant of the lock (weighted average credit spot to
  date). Gain = |oz| × (lock_price − basis_spot).

Balances per refiner per metal: `balance` = Σ credits, `locked` = Σ |locks|,
`available` = balance − locked; `basis` (moving weighted average credit spot),
`realised_gain` = Σ lock gains, `unrealised_gain` = available × (live − basis).

**Identities the screens must make visible, per metal:**

```
on hand          = Σ content of own lots in position On hand
incoming         = Σ content of own lots Incoming
at refiner       = Σ content of own lots At refiner
pool(refiner)    = Σ credits − Σ |locks|            (refiner's ounces, not ours)
movements        = arrived (+) · batched (−) · sold (−) · split/combine (±, net 0)
                   → running total equals on hand at every row
```

A lot's content and the pool credit it fed are different numbers (our figures
versus the refiner's assay). That difference is the settlement variance and it
belongs on the lot screen, not here (ruling: variance on lot screen yes, orders
no).

**Pool exits only through a lock.** Today there is no "take delivery as bars"
path from pool to on hand; a refiner purchase order that delivers bullion mints
new lots that arrive as Incoming → On hand like any purchase. Open question Q1.

## 2. Screens

Three chips under one Admin Header: **Lots · On hand · Pool**. The Admin Header
tabs become Orders · Inventory · People · Pricing (Pool tab removed, Q3).
List pages take the Admin Header (ruling 124); detail pages take site Header +
breadcrumb + Entity Header. Accordions everywhere a card has a body, exactly as
Orders. Badges sparse: title rows and header eyebrow only; never on table rows
(rulings 117, 118).

### 2.1 Inventory › Lots (list)

- Admin Header: title Inventory, chips Lots · On hand · Pool (Lots active),
  description line (count of own lots by position: "23 lots · 9 on hand · 4
  incoming · 5 at refiner · 3 pooled · 2 sold"), search.
- Toolbar: Metal (Select: All metals · Gold · Silver · Platinum · Palladium),
  Sort by, Reset. Filter row: Position (Radio Chips: All · Incoming · On hand
  · At refiner · Pooled · Sold · Consumed) with Form (All · Scrap · Bullion)
  chips at the right, as Jacob drew them.
- Table (flat, never grouped by order): Lot · Metal · Form · Content (oz
  fine) · Position (text, not badge) · Order (link) · Refiner order (link,
  when at refiner/pooled) · Updated. Row → Lot screen. Title row: "Lots" and the count badge only; the Batch and
  Combine icon buttons leave the title row because the Selection Bar (library)
  owns Combine · Assign to sale · Batch (only on-hand rows batch; a mixed
  selection shows the note).
- States: default, 3 selected, mixed selection, empty, mobile (Lot Card rows).
- The per-metal cards that sat above this table move to On hand.

### 2.2 Inventory › On hand (list)

- Same Admin Header, On hand chip active, toolbar off (the metal cards switch
  metal; the Movements card carries its own Metal select and date range).
  Description: "162.1 oz fine on hand · 9 lots".
- Metal cards, always four (Gold · Silver · Platinum · Palladium, Q4): on-hand
  fine oz (headline), lots count, scrap / bullion split, value at live bid
  (Q2; this is a pricing read, never screen arithmetic). Zero state reads
  0 lots / 0.00 oz. Clicking a card opens 2.4.
- Below: **Movements** card (accordion): Date · Movement (Arrived · Batched ·
  Settled, paid · Settled, pooled · Sold · Split · Combined) · Lot (link) ·
  Order or refiner order (link) · Metal · ± oz fine · Running on hand · By.
  Filter: Metal select, date range. This is the "past" of on hand.
- States: default, empty, mobile.

### 2.3 Inventory › Pool (list)

- Same Admin Header, Pool chip active. Description: "193.0 oz pooled across 2
  refiners".
- Refiner cards, one per refiner: per metal balance · locked · available (oz),
  basis spot, unrealised gain. No "Est. value" of unlocked ounces as a dollar
  headline (unlocked ounces have no price; unrealised gain against basis is the
  honest number). Clicking a card opens 2.5.
- Below: **Ledger** card (accordion), all refiners: Date · Entry (Credit ·
  Lock) · Refiner · Metal · oz · Spot (credit) or Lock price (lock) · Purpose ·
  Order (link: refiner order for a credit, sale order for a lock sourcing a
  sale) · By. Filters: Refiner, Metal, Entry.
- The only action anywhere on Pool is **Lock ounces** (dialog, existing
  design). **Record entry is removed**: a ledger row comes from a settlement or
  a lock, never from a hand-typed form.
- States: default, empty ("Nothing pooled"), mobile.

### 2.4 Inventory › On hand › Gold (detail)

What makes up the current on-hand balance for one metal, and its history.

- Site Header + breadcrumb Admin › Inventory › On hand › Gold.
- Entity Header (library): eyebrow "On hand", title "Gold", reference
  "10.02 oz fine · 4 lots", meta "value $xx,xxx at bid · updated 2m ago". No
  state badge (a balance has no state). Actions: none in v1.
- Accordions, in order: **Composition** (the on-hand lots of this metal: Lot ·
  Form · Weight · Purity · Content · Order · Since — rows link to the lot;
  footer totals the content and must equal the header), **In motion**
  (Incoming and At refiner lots of this metal, with where they are),
  **Movements** (the 2.2 ledger filtered to this metal), **Pool** (this
  metal's balance per refiner, each row linking to 2.5).
- Desktop and mobile.

### 2.5 Inventory › Pool › Elemetal (detail)

- Site Header + breadcrumb Admin › Inventory › Pool › Elemetal.
- Entity Header: eyebrow "Pool", title "Elemetal", reference "112.4 oz across
  3 metals", meta "last credit Sep 9 · last lock Sep 2". Actions: Lock ounces.
- Accordions: **Balances** (per metal: balance · locked · available · basis ·
  realised gain · unrealised gain), **Ledger** (this refiner's credits and
  locks, Credit rows link the refiner order, Lock rows link the sale order or
  read the purpose), **Open locks** (locks whose sale has not completed, with
  the Lock Row states Open · Confirming · Settled from the Pricing file).
- Desktop and mobile; Lock ounces dialog open state.

### 2.6 Lot screen

Exists (Lot Header, Where, lineage, Details, Content, Photos, Worth,
Documents). Changes from this ruling: none to layout; its header folds onto
Entity Header with the Identity, Reference and Actions slots once the library
publishes (Orders worker's pinned request).

## 3. Numbers on the screens reconcile

Every figure on a screen is one of the reads above, and the sample data must
obey the identities: the Lots description counts sum to the lot total; the
On hand cards sum to the On hand description; a metal detail's Composition
footer equals its header; a refiner's Balances equal its card; the Ledger's
credits minus locks equal available per metal. Before a screen is reported
done, the worker checks these sums and says so.

## 4. Open questions for Jacob (defaults applied until he answers)

- **Q1** Can pool ounces come back on hand as bars? Default **no**: pool exits
  only through a lock (sale or cash); delivered bullion arrives as a purchase.
- **Q2** Show value at live bid on the On hand metal cards? Default **yes**
  (held metal has a market value; this is a pricing read).
- **Q3** Pool tab leaves the Admin Header (Orders · Inventory · People ·
  Pricing) and lives as the third chip? Default **yes**.
- **Q4** Always four metal cards, Palladium included? Default **yes**.

## 5. API reads this needs (noted, not built here)

`GET /api/inventory/summary` (per metal on-hand lots, fine oz, scrap/bullion
split; value from pricing), `GET /api/inventory/movements?metal_id=&from=&to=`
(new, derived view over lot timestamps and lineage), `GET /api/inventory/pool`
balances with basis and gains (exists), `GET /api/inventory/pool/entries`
(exists), `GET /api/lots?position=&metal_id=&form=` (exists).
