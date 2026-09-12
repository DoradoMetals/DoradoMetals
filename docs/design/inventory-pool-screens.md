# Inventory & Pool screens — draft for review

Drawn 2026-09-11 in Figma **Orders** `ymmNlCDLVIfanpRQ7QHMIs`, against
`docs/design/inventory-model.md`, `docs/design/orders-lots-proposal.md`
(including its Revision 2026-09-11) and `docs/design/statuses.md` §2-4.
Everything here is DRAFT and waiting on Jacob (ruling 96). No code is written.

Nothing of Jacob's was modified. Every new thing is a library instance, a
variant of a library component, or a local component built from those.

## Where it lives

| page | section | id |
|---|---|---|
| Inventory | `Draft · for review · 2026-09-11` | `667:13892` |
| Pool | `Draft · for review · 2026-09-11` | `667:13893` |
| Components | `Draft · Inventory · 2026-09-11` | `667:13894` |
| Components | `Draft · Pool · 2026-09-11` | `667:13895` |

Desktop is 1440 with 1376 of content, split `Main` 952 + `Aside` 400 exactly as
`Admin / Purchase Order — PO-2481 (Desktop)` `168:2022` does. Mobile is a 390
viewport with 358 of content. Card chrome — `surface/card`, `border/default`,
`radius/base`, `stroke/hairline`, an Accordion title row and a
`4,16,16,16 / gap 16` body — is copied from `Charges` `152:1127`.

---

## 1. Lot screen

Breadcrumb `Admin > Inventory > Lot 2481-A`. Six states, one per position; each
is the same screen with its card instances swapped. Main column: `Details`, `Refiner`
(from At refiner onward), `Where`. Aside: `Worth`, `Lineage`, `Photos`. There is no Documents card on a lot
- documents belong to the order.

### Screens (frame ids unchanged through every rebuild)

| state | desktop | mobile |
|---|---|---|
| Incoming | `671:19511` | `671:24138` |
| On hand | `671:19947` | `671:24505` |
| At refiner | `671:20353` | `671:24885` |
| Pooled | `671:20757` | `671:25263` |
| Sold | `671:21190` | `671:25666` |
| Consumed | `671:21596` | `671:26046` |

### How the cards are built

Every card frame is a **duplicate of one of Jacob's own card frames**, with only
the body content and the title text replaced - the outer frame, the title row and
the body container are his, byte for byte:

- no controls in the title row -> duplicate of `Totals` `152:1187`
- a control in the title row -> duplicate of `Spots` `269:8922` (his `Title row`
  + `Right`, paddingRight `spacing/sm`, paddingTop `spacing/sm`)
- `Worth` is not a duplicate at all: it is a **live instance of his `Totals`**
  `170:2346` with the row text swapped, so its chrome can never drift.

Proof frame `694:76319` on the Components page places his `Totals` beside my
`Lineage` at the same 400 width; the title rows are indistinguishable.

### Header

A duplicate of `Order Header` `292:5060` / `292:5098`, text changed only. Three
lines: eyebrow `SCRAP LOT` (or `BULLION LOT`, mirroring PURCHASE ORDER / SALES
ORDER) with the position badge immediately beside it at his eyebrow-to-badge gap;
the item `14 Karat Gold` as the big title; and
`Lot 2481-A . PO-2481 . Marguerite Whitfield`, where `PO-2481` wears the library
Link. The right block is his: `Assigned to` on top, the button row under it. On
hand shows `Split` `Combine` `Assign to sale` (tertiary) and `Batch into`
(primary); every other position shows the select alone.

### Which card state each position shows

| position | Details | Refiner | Where | Worth (Totals instance) | Lineage |
|---|---|---|---|---|---|
| Incoming | `Kind=Scrap, State=ReadOnly` | absent | `PO-2481` . `In Transit` . **Open PO-2481** | `Spot . live` / Premium / Est. fine oz, total `Est. value` | Created |
| On hand | `Kind=Scrap, State=ReadOnly` | absent | `PO-2481` . `Received` . **Open PO-2481** | `Spot . live` (the order's spots are usually still unlocked) | Created . Received . Assayed |
| At refiner | `Kind=Scrap, State=Locked` | `State=Pending assay` | adds `SO-2493` . `Pending assay` . Open, and the refiner | `Spot . locked Aug 28` / Premium / Est. fine oz, total `Est. value` | adds Batched |
| Pooled | `Kind=Scrap, State=Locked` | `State=Settled` | adds `SO-2493` . `Settled` . Open, and the refiner | `Spot . locked Aug 28` / Premium / Settled fine oz / Variance, total `Settled value` | adds Settled |
| Sold | `Kind=Scrap, State=Locked` | absent | adds `SO-2488` . `In Transit` . Open | `Spot . locked Aug 28` / Premium / Margin, total `Sale price` | Created . Received . Assayed . Sold |
| Consumed | `Kind=Scrap, State=Locked` | absent | customer order only | `Spot . locked Aug 28` / Premium / Est. fine oz, total `Est. value` | adds Split and Combined |

`Kind=Bullion`, `State=Editing` and `Photos State=Empty` are drawn on the
components, not on a screen.

**The way out of the lot is the customer order.** `PO-2481` is a link in the
header, and the Where card's Customer order row carries a **Secondary**
`Open PO-2481`; refiner and sale rows keep a Tertiary `Open`.

### Local components

| component | id | states | what the API must provide |
|---|---|---|---|
| `Lot Header` | `690:36760` | `Position` x6 | `LotView.position` (**new**, §5.1). Eyebrow needs the lot kind; title the item name; line 2 the lot number, its customer order and the customer. `Assigned to` at the **lot** grain is **new**. Buttons map to `POST /api/lots/split` (exists), `POST /api/lots/combine` (**new**, §5.5), `POST /api/orders/lots/:id/assign` (**new**, §5.4), `POST /api/refining/orders/batch` (**new**, §5.5). |
| `Lot Header / Mobile` | `690:37145` | `Position` x6 | same; the button row wraps. |
| `Lot Details` | `697:25304` | `Kind=Scrap \| Bullion` x `State=ReadOnly \| Editing \| Locked` | Three equal columns, no holes. Scrap: `Kind` and `Metal` are library **Selects**, then `Purity`, `Pre melt`, `Post melt`, `Premium` as Inputs. Bullion: `Kind` and `Product` Selects, `Qty`, `Premium` editable, `Purity` and `Weight` read-only from the product. `Item`, `Purity label` and `Fine content` are gone - the name is derived from metal and purity and already sits in the header. Below a rule, a computed group in his Totals rows: `Content` and `Payable content` (content x premium), never editable. Everything editable writes through **`PATCH /api/orders/lots/:id`**, and **a premium change retiers the order's sibling lots**, so that endpoint must reprice siblings and return them. `Locked` carries `Edit on SO-2493` pointing at the owning order. |
| `Lot Refiner` | `698:43517` (mobile `698:43966`) | `State=Pending assay \| Settled \| Disputed` | A duplicate of his `Settlement` frame `327:9722`, so the title row, badge slot and body container are his. Its top group is **label/value rows, not fields** - a fact is never an Input. Rows from `refining.orders`: refiner, location, `sent_at`, `settled_at`, and the refiner order id for the `SO-2493` link and `Open SO-2493`. The `OURS · REFINER` table compares our figures against **`refining.lots`** - `pre_melt`, `post_melt` and `purity` on that table are the **refiner's** assay, ours are the lot's own - with the variance per metric; the variance turns `text/danger` only past tolerance, and **tolerance is a new setting** (no column defines it). `Settled value` is a pricing read; it is hidden until the refiner order settles. Mobile stacks the comparison three lines per metric. |
| `Lot Where` | `697:25794` | `Position` x6 | `orders.lots`, `refining.lots` + `refining.orders` (`sent_at`/`settled_at` -> the badge), `refiners` and location. Each badge is the derived order display state (`statuses.md` §3 - **new** as a view field); each `Open` needs the order id, which `orders.lots` carries. |
| `Worth` (no local component) | instance of `170:2346` | rows swapped per position | **The spot row follows the ORDER's spot state, never the lot's position**: `orders.orders.spots_locked` (exists) picks the label - `Spot . live` while unlocked, `Spot . locked <date>` once frozen - and the lock date needs a timestamp beside that boolean, which is **new**. There is no "spot at purchase": an incoming lot has not been priced against a frozen spot yet. Premium per lot is today on the order item / `order_metals`, not on the lot; exposing it on `LotView` is **new**. Estimate is `content` at the current spot; Settled is `refining.lots.post_melt`/`purity` with `refining.orders.settled_at`; Sold is the sale line and its margin. Every figure is a pricing read - the screen computes nothing. |
| `Lot Lineage` | `694:64571` | `Position` x6 | The lot's story, and only what has happened - no "Pending" rows, no employee names, no fulfillment steps (those live on the order); the position badge says where it is. Created `from PO-2481 . Marguerite Whitfield`: `orders.lots` plus the customer. Received `139.22 g . matches declared`: **gap** - nothing marks arrival or compares against the declared weight (`statuses.md` §Q3 recommends `received_at` on the inbound fulfillment). Assayed `56.3% . 2.505 oz fine`: **gap** - no inbound-assay column. Batched: `refining.orders.sent_at` + `refiners`. Settled: `settled_at` and the settled-vs-estimate delta. Sold: the sale `orders.lots` row. Split / Combined: `split_from_id` (exists) and the **undecided** combine column (`statuses.md` §4 recommends `combined_into_id`). |
| `Lot Photos` | `694:64781` | `State=Filled \| Empty` | The media domain's image routes: `POST /api/images` to upload, `GET /api/images/:id/url` to render. **A lot-to-image link is new** - images hang off accounts and orders today, and nothing associates one with a lot. |
| `Lot Card / Mobile` | `671:29223` | `Position` x5 | `GET /api/lots` - the mobile grain of `Lot Row (proposal)` `639:13959`, which has no mobile twin. |

---

## 2. Dialogs

Each is a local component set with a `Layout = Desktop | Mobile` axis, and each
is placed open over a scrim on a copy of the Lot screen so the modal can be read
in context.

| dialog | component | variants | open on (desktop) | open on (mobile) |
|---|---|---|---|---|
| Split lot | `671:16302` | `Layout` ×2 | `672:28264` | `672:28644` |
| Combine lots | `671:16636` | `Layout` × `State=Default \| Mismatch` (4) | `672:28338` | `672:28715` |
| Assign to sale | `671:18963` | `Layout` ×2 | `672:28403` | `672:28781` |
| Batch into | `671:19182` | `Layout` ×2 | `672:28483` | `672:28858` |
| Lock ounces | `671:19455` | `Layout` ×2 | `672:28556` (on the Pooled state) | `672:28928` |

| dialog | what the API must provide |
|---|---|
| **Split lot** | Splits already exist (`split_from_id` on the children, `lots-build.md`). The dialog needs the parent's weight and purity to compute `Remaining`, and purity is inherited rather than entered. `content` is a generated column, so the server must mint the children — the screen sends weights only. |
| **Combine lots** | `POST /api/lots/combine { lot_ids[] }` — **new** (§5.5). Refuses unless every lot is `on hand` and they share a metal and a unit; the `Mismatch` variant is that refusal, and the reason line `Lots must share a metal` is the rule's words, not the screen's. **The lineage column is undecided** — see `Lot Lineage` above. Weighted purity is pricing-domain arithmetic, not screen arithmetic. |
| **Assign to sale** | `POST /api/orders/lots/:id/assign { order_id }` — **new** (§5.4); the inventory source, so **no refiner order is created**. Needs the open sale orders for the Select (`GET /api/orders?direction=sale&status=open`) and `orders.lots.source = 'inventory'` (**new** column). `New draft sale` is a placement call on the existing sale endpoint. The line preview is priced by the pricing domain. |
| **Batch into** | `POST /api/refining/orders/batch { lot_ids[] \| order_ids[], refiner_id }` — **new** (§5.5). The refiner · location Select reads `refiners`; the refiner-order Select needs the open draft per refiner, which `one_open_sell_order_per_refiner` already implies (`POST /api/refining/orders` answers 409 naming the order to add to). The count and est. line come back from the call, which reports how many lots were taken and how many skipped, with their positions. |
| **Lock ounces** | Mostly built. `refining.pool` entries are `credit` \| `lock`; a lock carries `lock_price` and `POST /api/refining/pool/locks` writes one (`assertLockable`). New: the `purpose` (`Sell to refiner` \| `Source a sale`) and the link from a lock to the sale line it sources; the spot at lock time comes from the pricing domain. |

---

## 3. Pool page

Drawn on the Pool page, section `667:13893`.

### Screens

| screen | id | states |
|---|---|---|
| `Admin / Pool` | `671:22181` | overview, two refiner cards, chips `All · Gold · Silver · Platinum` |
| `Admin / Pool (Mobile)` | `672:24864` | 390 twin; refiner cards become stacked lists |
| `Admin / Pool — empty` | `671:23785` | Empty State `Nothing pooled` |
| `Admin / Pool — Elemetal` | `671:26523` | ledger: three metal cards, `Lock ounces`, metal + entry filter chips, six ledger rows, pagination |
| `Admin / Pool — Elemetal (Mobile)` | `673:34901` | 390 twin; ledger rows become stacked cards |
| `Admin / Pool — Elemetal, empty` | `671:28860` | ledger body is an Empty State `No entries` |
| `Admin / Pool — Elemetal, Lock ounces open` | `673:35314` | the dialog open over a scrim |
| `Admin / Pool — Elemetal, Lock ounces open (Mobile)` | `673:35428` | the same, 390 |

### Local components

| component | id | states | what the API must provide |
|---|---|---|---|
| `Pool Metal Card` | `670:13470` | `Metal = Gold \| Silver \| Platinum` | `GET /api/refining/pool` per refiner and metal (`balances.sql`). `balance` exists; **`locked` and `available = balance − locked` are one SQL change** if the balance read does not already split credits from locks; `est_value` is a pricing read, never screen arithmetic. |
| `Pool Refiner Card` | `671:19456` | single | the same rows, grouped by `refiner_id` then `metal_id`; refiner name from `refiners`. The totals row is the sum the server returns, not one the screen adds up. |
| `Pool Ledger Row` | `671:18631` | `Entry = Credit \| Lock` | **new** `GET /api/refining/pool/entries?refiner_id=&metal_id=&entry=` — append-only entries carrying `created_at`, `entry` (`credit` \| `lock`), `metal_id`, `content`, `lock_price`, `order_id`, `created_by`. Credits arrive when a refining order settles (`refining.lots` -> `refining.pool`, which exists). Locks do not exist. `POST /api/refining/pool/draws` (§5.4) is the adjacent debit. |
| `Lock ounces` (dialog) | `671:19455` | `Layout = Desktop \| Mobile` | see the dialog table above — entirely new. |

Badges follow the same language: `Credit` is Success · Soft (post), `Lock` is
Info · Soft (mid). The metal and entry filters are two new `WHERE`s, which is
exactly the blind spot `audit:query-paths` exists for (§5.6).

Arithmetic on the screens adds up: Elemetal 98.0 + 10.4 + 4.0 = 112.4 oz and
$237,597 + $290 + $3,912 = $241,800; Metalor 69.0 + 8.6 + 3.0 = 80.6 oz and
$167,326 + $240 + $2,934 = $170,500; the header reads 193.0 oz and $412,300.
Locked 8.0 + 4.0 = 12.0 oz, and the two `Lock` ledger rows (4.000 + 4.000 oz)
are exactly Elemetal's 8.0 oz of locked gold.

---

## 4. Inventory screen

`Admin / Inventory — proposal` `645:13069` already exists and was **not**
redrawn. Only what it lacked was added, as copies in the draft section.

| screen | id | what it adds | what the API must provide |
|---|---|---|---|
| `Admin / Inventory — 3 lots selected` | `671:26929` | three rows checked, `Selection Bar (proposal)` set to `Selection=On hand`, `3 lots · all on hand`, `$15,307 est. · 7.52 oz Au` | `GET /api/lots?position=on+hand` (**new** filter, §5.2). The bar's own figures are a pricing read over the selected ids, never summed on the screen. |
| `Admin / Inventory — mixed selection` | `671:26982` | three rows of three different positions, bar at `Selection=Mixed positions`, `3 lots · 3 positions` | the same read; the bar variant is chosen from the positions in the selection, so `position` must come back per row. |
| `Admin / Inventory — empty` | `671:27035` | Empty State `No lots on hand`, no Selection Bar, metal cards at zero | `GET /api/inventory/summary` (**new**, §5.2) must return zeroes rather than an empty body, or the four cards cannot render. |
| `Admin / Inventory (Mobile)` | `672:24425` | the 390 twin: stacked metal cards, wrapped filter chips, `Lot Card / Mobile` rows | same two reads. |

---

## 5. What could not be drawn with the library

1. **No mobile signed-in site header.** `Header` `56c9c60f…` publishes
   `Layout=Desktop, Signed In=True` but only `Layout=Mobile, Signed In=False`.
   Every mobile screen here therefore wears a signed-out header. This is a
   library gap, not a design choice.
2. **No Dialog / Modal component.** The five dialogs are local components built
   from `surface/popover`, `border/default`, `radius/xl` and library Buttons,
   Inputs, Selects and Radio Chips. If dialogs are going to recur, one Dialog
   component belongs in the library.
3. **No scrim token.** The modal scrim is a rectangle bound to
   `surface/background` at 70% node opacity. There is no `overlay/*` token to
   bind instead.
4. **No mobile twin of `Lot Row (proposal)` or of `Selection Bar (proposal)`.**
   `Lot Card / Mobile` `671:29223` was drawn for the first; the mobile Inventory
   screen has **no selection bar** because the second is 1376 wide and has no
   mobile form. Lot-grain selection on mobile is undrawn.
5. **`Assay Results` is not a canonical document name.** The Documents component
   carries Invoice / Packing List / Return Packing List / Shipping Instructions /
   Pickup Manifest / Pickup Instructions / Intake Receipt / Appointment
   Instructions / Settlement / Lot Manifest (`orders-notes-2026-09-05.md` §2).
   The lot screen's Documents card renames a row to `Assay Results`, which means
   a new `media.pdfs.kind` value.
6. **Cards have no mobile twins.** Details, Where, Worth, Lineage and Timeline
   are single components whose bodies are wrapped auto-layouts of 296-wide
   cells, so one instance reflows from 952 (3 across) to 358 (1 across). This
   departs from Jacob's `/ Mobile` twin convention deliberately — it halves the
   component count and cannot drift. `Lot Header` does have a `/ Mobile` twin,
   because its action row genuinely changes shape.
7. **`Page Header` `656:15023` cannot reflow inside an instance.** `layoutMode`
   is not an instance override, so the two mobile Pool screens carry a
   **detached** copy of it and will not track the component. A
   `Page Header / Mobile` twin is the fix.
8. **A component TEXT property cannot reach into a nested instance.** The
   refiner name and amount (an Accordion instance) and every order number (a
   Link instance) are per-instance overrides rather than named properties. Same
   reason `Lock price` is not a property on `Pool Ledger Row` — one default
   would wipe the `Credit` variant's em dash.
9. **`Stat/Small` is 30px in this file, not 18px.** The Pool metal-card figures
   therefore use `size/h4` + `line-height/h4` + `weight/semibold`, which are the
   exact tokens on Jacob's inventory card `Count` `642:12667`.
12. **The library Accordion ships its own stroke and a sample content panel.**
    Both have to be cleared on every instance (`strokes = []`, `Content`
    hidden) to match Jacob's order cards. A card-header variant of Accordion
    that does neither would remove the footgun.
13. **The Thumbnail component is 32/40px only.** The Photos card's hero image
    and its four thumbnails are Thumbnail instances resized to 240 and 64 tall;
    there is no image/media frame component in the library.
14. **Every Input adornment is trailing, including currency**, matching his
    `Charges` and `Spots` instances (`Trailing=Label`, `Trailing label` = `$`).
    The library's `Show leading label` slot is not used anywhere here.

### Where the Refiner card appears, and why not on Sold

It is drawn on `At refiner` (`State=Pending assay`) and `Pooled`
(`State=Settled`) only. **Not on Sold**: a lot in the Sold position left on a
sale order out of stock and never went to a refiner - pooled scrap is drawn down
as ounces, not sold as a lot - so there is no refiner engagement to show.
Decided 2026-09-12.

**Variance tolerance is a new setting.** The comparison table turns a variance
`text/danger` only past tolerance, and no column defines that threshold today;
it needs one before the `Disputed` state can be derived rather than typed.

### Two rules applied across the whole lot screen

1. **A fact is a row; only what an employee edits is an Input.** Dates, refiner
   figures, computed content and every dialog preview are `Totals`-style
   label-left value-right rows. 32 read-only Inputs across the five dialogs were
   converted. Where a date is genuinely edited it is the library **Datepicker**,
   not a text Input - none of the drawn states edits a date, so none appears.
   The one deliberate exception is `Details`: its editable fields stay Inputs in
   `ReadOnly` too, because the Edit toggle flips the same control in place.
2. **An order reference is one Link and nothing else.** `PO-2481`, `SO-2493` and
   `SO-2488` are Link-styled references on the header line, the `Where` rows, the
   `Refiner` card and the `Lineage` steps. There are no `Open …` buttons
   anywhere; the `Where` row keeps its state badge right-aligned.

`Worth` rows are now `Spot · live` (or `· locked <date>`), `Premium`,
`Payable content`, total `Est. value`; pooled swaps in `Settled fine oz` /
`Variance` / `Settled value` and sold swaps in `Margin` / `Sale price`.
