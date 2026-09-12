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

Breadcrumb `Admin › Inventory › Lot 2481-A`. Header eyebrow `LOT`, title
`Lot 2481-A · 14 Karat Gold`, the position badge, the `Assigned to` Select, and
the position-dependent actions. Six states, one per position; every state is the
same screen with the six card instances swapped to that position's variant.

### Screens

| state | desktop | mobile |
|---|---|---|
| Incoming | `671:19511` | `671:24138` |
| On hand | `671:19947` | `671:24505` |
| At refiner | `671:20353` | `671:24885` |
| Pooled | `671:20757` | `671:25263` |
| Sold | `671:21190` | `671:25666` |
| Consumed | `671:21596` | `671:26046` |

### Which card state each position shows

| position | Lot Header | Details | Where | Worth | Lineage | Timeline | Documents |
|---|---|---|---|---|---|---|---|
| Incoming | `Position=Incoming`, no actions | `Kind=Scrap` | `Position=Incoming` — position + PO-2481 `In Transit` | `Stage=Estimate` | `State=Empty` | `Position=Incoming` — Received current, rest upcoming | 3 · Settlement unavailable |
| On hand | `Position=On hand`, **Split · Combine · Assign to sale · Batch into** | `Kind=Scrap` | `Position=On hand` — position + PO-2481 `Received` | `Stage=Estimate` | `State=Empty` | `Position=On hand` — Received, Assayed complete | 3 · Settlement unavailable |
| At refiner | `Position=At refiner`, no actions | `Kind=Scrap` | adds SO-2493 `Pending assay` + `Elemetal · Dallas` | `Stage=Estimate` | `State=Empty` | Sent current | 3 · Settlement unavailable |
| Pooled | `Position=Pooled`, no actions | `Kind=Scrap` | adds SO-2493 `Settled` + `Elemetal · Dallas` | `Stage=Settled` | `State=Empty` | all complete | 4 · Settlement available |
| Sold | `Position=Sold`, no actions | `Kind=Scrap` | adds sale SO-2488 `In Transit` | `Stage=Settled` | `State=Empty` | Received · Assayed · Sold | 4 · Settlement available |
| Consumed | `Position=Consumed`, no actions | `Kind=Scrap` | adds `Split into` Lot 2481-A1, Lot 2481-A2 | `Stage=Estimate` | `State=Filled` | Received · Assayed · Split | 3 · Settlement unavailable |

`Kind=Bullion` is the Details card's other state (Qty shown, melt weights `—`);
it is drawn on the component, not on a screen, because the worked example lot is
scrap throughout.

### Local components

| component | id | states | what the API must provide |
|---|---|---|---|
| `Lot Header` | `668:11954` | `Position` ×6 | `LotView.position` (**new** — the derived view, `orders-lots-proposal.md` §5.1). Title needs the lot number + item name (`lots.items`); the sub-line needs fine content and post melt (`lots.items.content`, generated). `Assigned to` at the **lot** grain is **new** — today only the order carries an assignee (`Order Header` `292:5060`). The four actions map to `POST /api/lots/split` (exists), `POST /api/lots/combine` (**new**, §5.5), `POST /api/orders/lots/:id/assign` (**new**, §5.4), `POST /api/refining/orders/batch` (**new**, §5.5). |
| `Lot Header / Mobile` | `671:24137` | `Position` ×6 | same |
| `Lot Details` | `669:14919` | `Kind=Scrap \| Bullion` | `lots.items`: metal, kind, item, qty, `pre_melt`, `post_melt`, `purity`, `content`. Purity **label** (`14K`) has no column — either `products.purities.label` or **new**. |
| `Lot Where` | `670:17861` | `Position` ×6 | `orders.lots` (customer order + direction), `refining.lots` + `refining.orders` (refiner order, `sent_at`/`settled_at` → the `Pending assay`/`Settled` badge), `refiners` + location for `Elemetal · Dallas`, `split_from_id` for the children. The customer-order badge is the derived order display state (`statuses.md` §3 — **new** as a view field; `orders.orders.status` today is free text). |
| `Lot Worth` | `669:15179` | `Stage=Estimate \| Settled` | Paid: spot at purchase and premium per lot — today these live on the order item / `order_metals`, not on the lot; exposing them on `LotView` is **new**. Assay: `refining.lots.post_melt`/`purity` and `refining.orders.settled_at` give settled fine oz; variance vs estimate is the Settlement card's existing arithmetic (`Settlement` `327:9783`). Every figure is priced by the pricing domain — the screen computes nothing. |
| `Lot Lineage` | `669:15240` | `State=Filled \| Empty` | `split_from_id` (exists) gives parent and children. **Combined into has no column** — `orders-lots-proposal.md` §5.5 leaves it open and `statuses.md` §4 recommends `combined_into_id` on the parents. The Empty state is the honest default until that lands. |
| `Lot Timeline` | `670:18326` | `Position` ×6 | Received: **gap** — nothing marks a purchase order's metal as arrived (`statuses.md` §Q3; the recommendation is `received_at` on the inbound fulfillment). Assayed: **gap** — no inbound-assay column exists at all. Batched / Sent: `refining.orders.sent_at`. Settled: `refining.orders.settled_at`. Sold: the sale `orders.lots` row. Split: `split_from_id`. "Who" per step is the audit actor (`audit_stamp` fills `created_by`) — reading it back is **new**. |
| `Lot Card / Mobile` | `671:29223` | `Position` ×5 | `GET /api/lots` — the mobile grain of `Lot Row (proposal)` `639:13959`, which has no mobile twin. |

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
