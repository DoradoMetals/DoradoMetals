# Orders & Lots: the positions proposal

Drafted 2026-09-11 for Jacob's approval (ruling 96: no frontend component
without a Figma design he approved; ruling 103: an agent may draft in Figma, he
approves). Everything below is DRAWN and waiting on him — nothing here is
scheduled work and no code has been written.

Figma file `ymmNlCDLVIfanpRQ7QHMIs`, page **Orders & Lots** `618:4459`, section
**Proposal · positions** (`638:13010`), to the right of his work at x = 11600.
**Not one node of his was modified, renamed or moved.** Every proposal is a COPY
of his component with one change applied, built from tokens and library
instances; the only hand-made things are text nodes.

The model it draws is `docs/design/inventory-model.md`. The API it is drawn
against is `docs/waves/lots-build.md`.

---

## 1. The knot, and the four ideas that untie it

Jacob: *"I'm struggling with inventory … orders will be one to one with refiner
orders but sometimes we batch … we're not gonna pay out a customer until the
refinery has paid us, although in the future we need to be allowed to send them
money before … we might have bullion inventory and use it for a Gold Eagle
order, so a refinery order wouldn't happen at all."*

1. **A lot has one POSITION**, derived from the links and never from a column
   somebody forgets: `incoming` · `on hand` · `at refiner` · `pooled` · `sold` ·
   `consumed`. Inventory is the on-hand lots plus the pool, per metal.
2. **A refiner order is optional and many-to-many.** One-to-one is the common
   case of the many-to-many `refining.lots` already has, not a rule. Batch mints
   one refiner order from on-hand lots of any orders; Combine merges lots before
   they go. A sale filled from stock has no refiner order at all.
3. **Payout timing is a POLICY**, not a position: `after_settlement` (today) or
   `on_assay` (later). Switching the setting is the whole change.
4. **A sale is filled from a SOURCE, chosen per line**: inventory, refiner
   (drop ship), or pool.

---

## 2. His component → proposed change → why

| His component | Proposed | What changes | Why |
|---|---|---|---|
| `Lot Row` `619:4869` | `Lot Row (proposal)` **`639:13959`** | `State=Unassigned/Selected/Assigned` becomes `Position=Incoming/On hand/At refiner/Pooled/Sold`. Same layout, columns and widths; the `Assigned to` cell is renamed `Position` and carries the badge. | "Unassigned" is one position of six. Today a pooled lot and a sold lot both read "Assigned", so the table cannot say where the metal is. `Selected` comes OFF the enum — it is a selection state on the checkbox — which is what lets the enum be the model. |
| `Order Card` `618:4776` | `Order Card (proposal)` **`640:13045`** | Foot only. The summary becomes the lots-by-position line; a payout gate reason line is added under it. Card stays 336 × 372. | "4 unassigned · $13,346.09" is true only while every lot is scrap bound for a refiner, and nothing on the card says why Send payment is greyed. Both lines are READ (position view, payout rule), never typed. |
| `Selection Bar` `619:4700` | `Selection Bar (proposal)` **`641:14984`** | Actions become the position transitions: Batch (on hand → at refiner), Assign to sale (on hand → sold), Combine (on hand only). Combine is always drawn; every disabled action is explained in a third line. The destination Select follows the action. **The bar keeps its place on BOTH screens** — `Selection=Orders` is the order grain, the other four are the lot grain. | The bar is the one place a position changes, so its buttons should BE the transitions. One Batch button cannot express filling a sale from stock. A greyed button with no reason is the failure mode this removes. |
| `Unassigned Card` `619:4942` | `Inventory (proposal)` **`642:12662`** | Per metal, two numbers: on-hand lots and pool ounces. | A pooled ounce is metal we own and can sell. The current card has nowhere to put it, so the top of the screen under-reports what the business holds. "Unassigned" is not retired, it is renamed: it always meant ON HAND. |
| — (new) | `Source Control (proposal)` **`643:12678`** | Inventory / Refiner / Pool, per sales-order line. Radio Chips, the control the Filter Bar already uses. | A sale filled from stock has no refiner order and the Sales screen has no way to say where a line comes from. Per LINE, because one line can come out of stock while the next is drop-shipped. |
| — (new) | `Payout Timing (proposal)` **`643:12699`** | After settlement / On assay. One setting, in Settings › Payments. | It is a business policy, not an order fact. On an order it invites a per-order exception nobody audits, and the payout gate is the last thing that should be quietly overridable. |
| `Lot Tile` `618:4497` | unchanged | Its `Meta` value carries the position for a lot that has left ("at refiner · RO-118", "pooled · RO-104", "sold · SO-2488") instead of "on SO-####". | A text value, not a component change. |
| `More Tile`, `Filter Rail`, `Order Context Menu`, `Filter Bar (proposal A)` | unchanged | The Filter Bar's `Show` select gains position values ("Orders with lots on hand", "Orders at a refiner", "Orders waiting on settlement"). | A value list, not a component change. |

### Badge colour language

His one language, unchanged — Warning → Info → Success, pre → mid → post,
Neutral Outline for "not set".

| Position | Badge |
|---|---|
| Incoming | Warning · Soft |
| On hand | Info · Soft |
| At refiner | Info · **Outline** — the badge he already drew for a lot out at a counterparty |
| Pooled | Success · Soft |
| Sold | Success · Solid |
| Consumed | Neutral · Outline (not a variant: a consumed lot does not appear in a lots table) |

---

## 3. The screen split — his question, answered

Jacob: *"Should we split out the screens for orders/lots/inventory? Rn its
kinda weird mix between orders and lots."*

**Yes. Two screens, not three.** The mix reads wrong because one screen answers
two questions with one list: *which orders need work* is about contracts and
money; *what do we hold* is about metal. They share the lot, and that is all
they share — so the lot is the link between two screens, not a reason to keep
one.

1. **`Admin / Orders`** — customer and refiner orders only. The Purchases /
   Sales chips and the Customers / Refiners radio stay exactly as drawn. Each
   card carries its lots by position and its payout gate reason and opens the
   order screen that already exists. **Order selection and the Selection Bar
   stay** — see §3.1.
2. **`Admin / Inventory`** — what we hold: on-hand lots per metal plus the pool
   balances per metal. **This is where LOT-grain work lives**: single lots,
   splits, Combine, Assign to sale. His `Admin / Lots — Gold, unassigned`
   becomes this screen; "unassigned" was always the ON HAND position, so the
   screen was already inventory under another name.
3. **The lots ledger is not a third page.** It is the Position filter on
   Inventory set to "All positions", plus search — every lot the business has
   ever held, incoming to consumed, in one table. A separate Lots page would
   differ from Inventory by one filter value and would then grow its own copy of
   the columns, the selection and the transitions.

### 3.1 Batching has two grains, and they are the same transition

Jacob, after the first draft: *"I think I do like batching at the orders level.
It just looks really nice."* He is right, and the correction is not a
compromise — it falls straight out of the model.

- **ORDER grain, on `Admin / Orders`.** Select orders, press Batch, and every
  ON HAND lot on them goes to one refiner order. That is the one-to-one case
  and the few-to-one case in a single press — the everyday move — which is
  exactly why his card checkbox and Selection Bar stay where he put them.
  An order whose lots are only partly on hand says so in its position line, and
  the bar says how many lots the batch will actually take, so the count can
  never surprise anyone.
- **LOT grain, on `Admin / Inventory`.** Single lots, splits, Combine and
  Assign to sale — anything that has to look at one lot rather than a whole
  order.
- **One component either way.** `Selection=Orders` (`649:13427`) on Orders;
  the four lot-grain variants on Inventory. One transition, one bar, two places
  to press it — which is also why the API needs `POST
  /api/refining/orders/batch` to take lot ids AND accept an order id expanding
  to that order's on-hand lots, rather than two endpoints (§5.5).

---

## 4. Every frame id

**Section** `Proposal · positions` label `638:13010` · note frame `638:13011`.

| Frame | id |
|---|---|
| `Lot Row (proposal)` (set) | `639:13959` |
| — `Position=Incoming` | `639:13994` |
| — `Position=On hand` | `639:14011` |
| — `Position=At refiner` | `639:14028` |
| — `Position=Pooled` | `639:14076` |
| — `Position=Sold` | `639:14104` |
| `Order Card (proposal)` (set) | `640:13045` |
| — `Selected=false, Direction=Purchase` | `640:13046` |
| — `Selected=true, Direction=Purchase` | `640:13068` |
| — `Selected=false, Direction=Sale` | `640:13090` |
| — `Selected=true, Direction=Sale` | `640:13112` |
| `Selection Bar (proposal)` (set) | `641:14984` |
| — `Selection=On hand` (all three legal) | `641:14854` |
| — `Selection=Mixed positions` (all three refused) | `641:14880` |
| — `Selection=Across orders` (Combine refused) | `641:14920` |
| — `Selection=Pooled or sold` (nothing moves) | `641:14947` |
| — `Selection=Orders` (order grain, Batch only) | `649:13427` |
| `Inventory (proposal)` (set) | `642:12662` |
| — `Metal=All` false / true | `642:12663` / `642:12669` |
| — `Metal=Gold` false / true | `642:12675` / `642:12681` |
| — `Metal=Silver` false / true | `642:12687` / `642:12693` |
| — `Metal=Platinum` false / true | `642:12699` / `642:12705` |
| `Source Control (proposal)` | `643:12678` |
| `Payout Timing (proposal)` | `643:12699` |
| **Screen** `Admin / Orders — proposal` | `644:12690` (note `644:13520`) |
| **Screen** `Admin / Inventory — proposal` | `645:13069` (note `645:13781`) |

His frames, read and untouched: `618:4497` `618:4498` `618:4776` `619:4639`
`619:4700` `619:4750` `619:4869` `619:4942` `626:11861` `620:5115` `620:5789`
`620:6474` `634:12204` `634:13082` `634:13748`, and the five screen notes
`641:13343`–`641:13347`. (He consolidated his screens mid-session: the separate
"Filter bar" screen is gone and every screen now carries the Filter Bar
instance. These proposals are composed from the CURRENT state.)

---

## 5. What the API has, and what this design adds

`docs/waves/lots-build.md` already gives us `lots.items`, `orders.lots`,
`refining.orders` / `.lots` / `.pool`, splits, the finalize gate and the payout
state machine. Nothing below asks for a table to be dropped or a wire shape to
be preserved — ruling: the frontend follows the API (CLAUDE.md, 2026-09-02).

### 5.1 The position view — the one thing everything else reads

`position` is DERIVED, never stored, so it cannot go stale.

| position | derivation |
|---|---|
| `incoming` | `orders.lots` row on a purchase order, order not received |
| `on hand` | received, no `refining.lots` link, no sale link |
| `at refiner` | `refining.lots` row on an open (sent, unsettled) refining order |
| `pooled` | its refining order settled; `refining.pool` credited |
| `sold` | `orders.lots` row on a SALE order |
| `consumed` | it is the parent of a `split_from_id` (or of a combine) |

- One SQL expression, one place — `db/lots/sql/position.sql`, the way
  `order_reference.sql` is substituted into both `list.sql` and `view.sql` so
  two reads cannot disagree.
- `LotView.position` on every lot shape; `OrderLotView` carries it too.
- Indexable: the Inventory table filters on it and dev-sized row counts will
  hide a missing index (`audit:query-paths` is the guard).

### 5.2 Inventory reads

- `GET /api/lots` — `?position=` (repeatable), `?metal_id=`, `?q=` (search),
  `?order_id=`, paged → `LotView[]`. This one route is both the Inventory table
  and the lots ledger; "the ledger" is `position=*`.
- `GET /api/inventory/summary` → per metal `{ metal_id, on_hand_lots,
  on_hand_content, pool_content, est_value }`. The Inventory cards. `pool_content`
  comes from `refining.pool`, which already answers `GET /api/refining/pool`.
- `lots.md` §3 says a lot gains a life away from an order as an `inventory`
  domain; this is that domain's first two routes.

### 5.3 The payout policy and its gate

- One setting, `after_settlement` | `on_assay`, admin-readable and
  admin-writable: `GET` / `PATCH /api/settings/payout_timing`. It belongs beside
  the business's own organization row (`047_seed_reference_data.sql` supplies
  that kind of row), not on an order.
- `rules.payoutBlockedBy(order, policy)` → the reasons, in the operator's words,
  exactly as `rules.finalizeBlockedBy` already does.
- `OrderActions` gains `payout_blocked_by: string[]`, and the send-payment
  endpoint REFUSES on the same list — same shape as the finalize gate, so the
  screen and the server cannot disagree.
- `OrderListItem` gains `lots_by_position: { incoming, on_hand, at_refiner,
  pooled, sold }` and `payout_blocked_by`, which is what the Order Card's two
  new lines read.

### 5.4 Sale sourcing

- `orders.lots.source` — `inventory` | `refiner` | `pool`, per line, set at
  placement and patchable while the order is editable.
- `inventory`: `POST /api/orders/lots/:id/assign { order_id }` moves an on-hand
  lot onto a sale. **No refiner order is created** — this is the Gold Eagle case.
- `refiner`: the existing `POST /api/orders/:id/supply` (drop ship, Linked
  Fulfillment) — unchanged, and now one source of three rather than the only path.
- `pool`: `POST /api/refining/pool/draws { metal_id, content, order_id }` debits
  the pool and mints a lot for the sale. The pool is append-only by design, so a
  draw is a signed entry, not an update.

### 5.5 Batch and Combine

- **Batch across orders as one call**: `POST /api/refining/orders/batch
  { lot_ids[] | order_ids[], refiner_id }` → the refining order. The two grains
  are one endpoint: `order_ids` expands server-side to every `on hand` lot on
  those orders (the Orders screen), `lot_ids` names them exactly (Inventory).
  Expanding on the server is what keeps the two screens honest about the same
  number, and the response says how many lots were taken and how many were
  skipped, with their positions. The pooling mechanic already exists
  (`one_open_sell_order_per_refiner`, and `POST /api/refining/orders` answers
  409 naming the order to add to), so this composes rather than invents.
  Refuses unless every lot it is about to take is `on hand`.
- **Combine**: `POST /api/lots/combine { lot_ids[] }` → one lot; the parents
  become `consumed`. Refuses unless every lot is `on hand` and they share a metal
  and a unit.
  **Open question for Jacob**: a split records `split_from_id` on the CHILD. A
  combine is the reverse and has no column — either `combined_into_id` on the
  parents, or `split_from_id` re-read as "this lot's successor". Ask before
  writing the migration; `content` is a generated column and a wrong answer here
  double-counts fine ounces.

### 5.6 Guards this will need

- `audit:query-paths` — the position filter and the metal filter are new
  `WHERE`s with no `exchange` index to be compared against, which is precisely
  the blind spot that audit exists for.
- `audit:enum-domains` — if `position` is ever compared against a text column,
  a value that is not a label raises 22P02 and takes the whole read down.
- `validate:wire` refuses a field no contract declares, so regenerate contracts
  in the same pass as `lots_by_position` and `payout_blocked_by`.

---

## 6. What is still Jacob's

- **Approval.** Ruling 96: nothing is built from this until he says so.
- The combine lineage column (§5.5).
- Whether an order-grain Batch should offer to include a partly-received order's lots as they arrive, or make the operator come back.
- Whether `Consumed` earns a chip on the Inventory position filter (drawn, at 0).

---

## Revision 2026-09-11 — Jacob's five critiques

Second pass on the **Proposal · positions** section only. Nothing of his was
touched, and the Source Control (`643:12678`) and Payout Timing (`643:12699`)
frames are unchanged — no critique reached them. Every new part is a library
instance (Themes and Components / Icons); no raw hex, no invented component.

### 1 · "Little too wordy in places"

Every helper line, note and subtitle is now at most a short phrase plus its
figures.

| Where | Was | Is | Frame |
|---|---|---|---|
| Section note | 24 paragraphs of rationale | heading + one 33-word paragraph; the rationale is this doc | `638:13011` |
| Selection Bar | a third "Reason" line on all five variants | gone; one helper line survives, on `Mixed` only | `641:14984` |
| Inventory card, All | "pooled — see each metal" | line deleted | `642:12663` / `642:12669` |
| Inventory card, metals | "fine, at 2 refiners" | "2 refiners" / "1 refiner" / "nothing pooled" | `642:12675`–`642:12705` |
| Inventory subtitle | "What we hold — 23 lots on hand across 3 metals, plus the fine ounces the refiners owe us" | "23 lots on hand · 3 metals · 193.0 oz pooled" | `656:15122` |
| Order Card gate | "Payout waits on refiner settlement · 2 of 3 refinable lots are still at a refiner" | "Waiting on settlement · 2 of 3 lots" | `640:13045` |
| Order Card gate, sale | "Charge must be received before we source · $8,410 due from the customer" | "Charge due · $8,410" | `640:13045` |
| Order cards on screen | "Payable now · every lot received and assayed, and none of them needs a refiner" | "Payable now" | `644:12702` |

### 2 · "Cards should expand across screen"

The per-metal Inventory cards now **fill** the content width as four equal
columns — `Metals` (`645:13397`) is `FILL`, every card instance is `FILL`, and
each lands at 326 wide with no trailing gap. The lot table was already `FILL` at
1376.

The order-card grid (`644:12702`) stays a fixed 332-wide tile rather than `FILL`
children, and that is deliberate: it is a **wrapped** auto-layout, and a `FILL`
child in a wrapped row has a zero minimum width, so all six cards collapse onto
one line. 4 × 332 + 3 × 16 = 1376 exactly, so the row already reaches both
edges of the content width. If the card count per row ever has to change, the
card width changes with it — there is no Figma construct that gives equal
wrapped columns.

### 3 · "Scrap vs. bullion filter"

A `All · Scrap · Bullion` group, built from the **Radio Chip** the position
chips already use (library key `fe8e5177…`), on both screens:

- **Inventory** — beside the position chips, in a new `Filters` row that holds
  the two groups 32 apart: `656:15180` (group `656:15181`).
- **Orders** — its own row under the filter bar: `656:15194`.

It is a sibling row rather than an edit to `Filter Bar (proposal A)`
(`626:11861`), which is his and stays untouched.

### 4 · "Make sure the headers of the pages are equal"

One local component, **`Page Header` `656:15023`**, placed on both screens, so
they cannot drift:

```
Breadcrumb  Admin › … › …
Title  +  selectable chips (same row)            [ search, far right ]
one-line description
```

Properties: `Title`, `Description`, `Show chip 3`, `Show chip 4` (Orders hides
chips 3 and 4). Chip labels, chip `Selected`, the crumbs and the search
placeholder are per-instance overrides. Built by cloning the breadcrumb, H2,
subtitle, chips and search field that were already on the screens, so every
token binding came with them; the ground is the screen's own bound fill.

- Orders instance `656:15024` — `Admin › Orders › Purchases`, title **Orders**,
  chips `Purchases · Sales`, "6 orders open · 18 lots on hand".
- Inventory instance `656:15122` — `Admin › Inventory › Gold`, title
  **Inventory**, chips `All · Gold · Silver · Platinum`, "23 lots on hand ·
  3 metals · 193.0 oz pooled".

Breadcrumb on **both**. The screens' own title rows (`644:12693`, `645:13073`)
and the loose breadcrumb (`645:13072`) are deleted — the instance replaces them.

### 5 · "What's going on with the bottom batching toolbar?"

**The bar shows only the actions that apply to the selection's grain. There is
no disabled trio.** `Clear` is gone as a text button; deselect is now an
icon-only ✕ — the library **Icon Button** (`d01ef6d6…`, Tertiary / Neutral /
Default) with the Icons `x` glyph — sitting to the left of the summary.

The Select reads **`Elemetal · Dallas`**; the "new draft" wording moved into its
label, which is now `Batch into new draft`. Two lines of summary, never three.

The set (`641:14984`) is down from five variants to three:

| Variant | id | Actions |
|---|---|---|
| `Selection=Orders` | `649:13427` | ✕ · **Batch into new draft** [Elemetal · Dallas] · **Batch** |
| `Selection=On hand` | `641:14854` | ✕ · Combine · Assign to sale · [Elemetal · Dallas] · **Batch** |
| `Selection=Mixed positions` | `641:14880` | ✕ only, plus one line: "Only on-hand lots can be batched" |

`Selection=Across orders` and `Selection=Pooled or sold` are **deleted**. Both
existed only to draw a greyed button with a reason beside it, which is the thing
the new rule removes: across orders, Combine is simply absent; pooled or sold is
a mixed selection and reads as `Mixed`. Two lot-grain states, as asked.

### Unchanged, and why

- **Badge colour language** — untouched. Warning → Info → Success for pre → mid
  → post, Danger for problems, Neutral Outline for not set / draft.
- **Lot Row (proposal) `639:13959`** — nothing in it was wordy; the columns
  already fill 1376.
- **Source Control `643:12678`, Payout Timing `643:12699`** — no critique
  reached them.

### Nothing was invented, one thing could not be expressed

Every new element is a library instance or a variant of one: Icon Button, Radio
Chip, Chip, Input, Breadcrumb, Select, Button. The only thing the library could
not express is **equal wrapped columns for the order-card grid** (§2) — that is
a Figma auto-layout limit, not a missing component, and the fixed 332 tile
reaches both edges anyway. No new component was drawn.

### Frame ids added this pass

| Frame | id |
|---|---|
| `Page Header` (local component) | `656:15023` |
| — instance on `Admin / Orders` | `656:15024` |
| — instance on `Admin / Inventory` | `656:15122` |
| `Filters` row on Inventory | `656:15180` |
| — `Form filter` group (All · Scrap · Bullion) | `656:15181` |
| `Form filter` row on Orders | `656:15194` |
| Deselect ✕, per Selection Bar variant | `655:13500` · `655:15000` · `656:13490` |

Deleted this pass: `641:14920`, `641:14947` (Selection Bar variants),
`644:12693`, `645:13072`, `645:13073` (the screens' old header parts), and 22
paragraphs from the note frame `638:13011`.
