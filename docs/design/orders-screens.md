# Orders screens: settlement, and the derived order state

Drafted 2026-09-11 for Jacob's approval (ruling 96: no frontend component
without a Figma design he approved; ruling 103: an agent may draft, he
approves). Everything below is DRAWN and waiting on him. No code is written.

Figma file **Orders** `ymmNlCDLVIfanpRQ7QHMIs`. Two draft sections:

| section | page | id |
|---|---|---|
| `Draft · for review · 2026-09-11` (screen copies, mobile frames, notes) | Orders | `664:11578` |
| `Draft · Orders · 2026-09-11` (new local components) | Components | `664:11577` |

**Not one node of his was modified, renamed or moved.** Every proposal is a
COPY built from library instances and tokens.

---

## 1. Intake — nothing to draw

An earlier pass drew a `Received` axis on the Lots card (Awaiting / Receiving
/ Received, a `Mark received` button, a Variance column, position badges).
**Jacob cut all of it.** The rulings, in his words:

- *"I don't think we'll ever need this mark received button."* Arrival is
  already recorded by the fulfillment card's own actions and the carrier
  scans; the in-house assay is the employee editing the fields his Lots card
  already has.
- *"I feel assaulted by the number of badges."* No position badge and no
  Variance column on the order screen.
- *"Variance belongs on the Lot screen, maybe too much on the orders screen."*

So **his `Lots` card stands as it is on the order**, and intake needs no new
component. Variance against the customer's declaration is shown on the **lot**
screen (Lineage and the Refiner card), not here.

What the API still needs underneath is unchanged and still missing
(`docs/design/statuses.md` §2/Q3): a **`received_at` on the inbound
fulfillment**, because without it `on hand` is underivable and the `on_assay`
payout policy has nothing to gate on. That is an API fact with no screen of
its own.

---

## 2. Settlement — his own cards, four changes

Jacob: *"this should all look EXTREMELY similar to the lots on the customer
orders."* An earlier pass drew a settlement grid with appended refiner
columns, a footer, a title-row badge and parent/child sub-rows. **All of it is
deleted.** The refiner sale order is his `Sales Order (Refiner)` `320:2717`,
same card order, with an exhaustive four changes and no others.

1. **The lots card's title reads `Settlement`.** Its columns stay HIS — `Item`
   · `Order` · `Qty` · `Post Melt` · `Purity` · `Premium` · `Price`. On this
   card Post Melt and Purity **are the refiner's figures**, pre-filled from
   ours until settled, and editable. No extra columns, no footer, no badge in
   its title row. His three icon buttons stay: add item, combine, remove.
2. **Row sub-label is `Lot 2481-A` only**; the order number lives in the Order
   column, where it already did.
3. **A refiner-combined lot is ONE row** — item `14K / 18K Gold`, sub-label
   `Combined · 2481-A + 2481-B`. No child rows.
4. **The header** carries the Order State badge beside the eyebrow and the
   refiner-name title fix (§3).

The settlement state and its actions live where his own card already carries
the badge: the aside `Settlement` card.

| component | frame id | states | source | what the API must provide |
|---|---|---|---|---|
| `Settlement · proposed` | `718:38422` | `Pending` `718:38308` · `Settled` `718:38345` · `Disputed` `718:38384` | **apply at source** on `Settlement` `327:9783` | its one change is the title row: `Record settlement` (primary) in Pending and Disputed, `Dispute` (tertiary) in Settled, beside the badge it already carries. Behind it: `PATCH /api/refining/lots/:id { post_melt, purity }` writing the refiner's figures onto the lots already at the refiner, and `settled_at` / `disputed_at` on the order, which `refining/orders/sql/view_one.sql` already reads for the badge. |

**The refiner-combined lot — API, new.** A combine allowed for lots already
`at refiner`, recorded as lineage (`combined_into_id` on the parents, the
column `orders-lots-proposal.md` §5.5 flags as undecided), with the settled
content allocated back to each parent's customer order **pro rata by our
estimated fine oz**. Pro rata matters because each parent lot belongs to a
different customer purchase order and its payout is computed from its own
content. The screen shows the result as one row; the allocation is the
server's, not a control.

`Settlement · proposed / Mobile` **`722:46038`** (`Pending` `722:45922` ·
`Settled` `722:45961` · `Disputed` `722:46000`) is the Mobile twin: the badge
stays in the title row and the action goes full width at the foot, the way his
other Mobile twins already do it.

### 2.1 Import never fills anything by itself

Jacob: *"they may not always put the correct lot ids on the invoices, so we
can't fully rely on PDF imports"* and *"when we upload the refiner
settlement/invoice to Documents, that's when it populates, a dialog with the
user's choice."*

| component | frame id | states | source | what the API must provide |
|---|---|---|---|---|
| `Match settlement lines` | `710:49549` | `Layout=Desktop` `710:49333` · `Layout=Mobile` `710:49442` | **new** | `POST /api/refining/orders/:id/settlement-import` parses the PDF and **returns lines**: `{ reference, weight, purity, fine_oz }[]` plus a suggested lot per line. **It writes nothing.** Applying fills the lots card; the employee still presses `Record settlement`. |

It opens from the **Documents** card's `Settlement` row, whose Unavailable
state already carries `Import` (library change, `orders-notes-2026-09-05.md`
§2), and is centred in the first viewport over a scrim.

Its body is four labelled sections with a hairline between them and **no
badges** — Jacob: *"stop with the badges, they should be used sparsely. These
can just be sections."*

| section | what is in it | control |
|---|---|---|
| `MATCHED` | invoice line left, our lot right, pre-selected by nearest weight | Select, never auto-confirmed |
| `UNMATCHED` | invoice lines we could not place | Select, empty |
| `NOT ON INVOICE` | our lots with no line | Select, to attach a line or leave |
| `EXTRA ON INVOICE` | invoice lines that resolve to nothing of ours | none, shown for the record |

A section with nothing in it is omitted. `Apply matches` primary, `Cancel`.

**Badge rule, applied throughout.** A badge appears only where his own cards
use one — a state in a title row, and the Order State in a header. Every other
badge drawn in earlier passes has been removed.

---

## 3. Derived order state

| component | frame id | states | source | what the API must provide |
|---|---|---|---|---|
| `Order State` | `664:12789` | 14, one axis. Purchase: `Awaiting Receipt` `664:12714` → `Awaiting Payout` `664:12720` → `At Refiner` `664:12725` → `Ready to Pay` `664:12731` → `Completed` `664:12767`. Sale: `Awaiting Payment` `664:12736` → `Preparing` `664:12741` → `In Transit` `664:12746` → `Completed`. Refiner sale: `Pending Assay` `664:12751` → `Settled` `664:12761` / `Disputed` `664:12772`. Refiner purchase: `Awaiting Delivery` `664:12756` → `Awaiting Payment` → `Completed`. All: `Draft` `664:12783`, `Cancelled` `664:12778`. | **new** | the derived state view (`statuses.md` §3): `orders.orders.status` narrows to `draft \| open \| cancelled` and one SQL `CASE` — on the model of `refining/orders/sql/view_one.sql` — projects the display state from payout/charge `state`, fulfillment state and lot positions. `OrderView.state` and `OrderListItem.state` both read it. `OrderActions.statuses` is dropped (nothing reads it). |
| `Order Header · proposed` | `671:26494` | `Admin, Customer, View` `671:26436` · `External, Customer, View` `671:26457` · `Admin, Refiner, View` `712:19520` · `Admin, Refiner, Editing` `712:19550` | **apply at source** on `Order Header` `292:5060` | `OrderView.state` |
| `Order Header · proposed / Mobile` | `671:28373` | `671:28323` · `671:28340` · `712:19585` · `712:19615` | **apply at source** on `Order Header / Mobile` `292:5098` | same |
| `Order Card · proposed` | `671:28586` | `Selected=false\|true` × `Direction=Purchase\|Sale` — `671:28446` `671:28470` `671:28494` `671:28518` | **apply at source** on `Order Card (proposal)` `640:13045` | `OrderListItem.state`, plus the lot count and estimated value already on the card |
| `Order Card · proposed / Mobile` | `671:28777` | `Direction=Purchase` `671:28731` · `Direction=Sale` `671:28754` | **new** (he has no mobile twin) | same |
| `Filter Bar · proposed` | `715:38985` | `Set=Purchases` `715:38920` · `Set=Sales` `715:38954` | **apply at source** on `Filter Bar (proposal A)` `626:11861` | `GET /api/orders?state=` (repeatable) over the derived state, and a count per chip. The state is derived, so the filter is a `WHERE` with no `exchange` index behind it — `audit:query-paths` is the guard. |

**Header.** The `State=Active/Cancelled/Sent` axis goes away; the eyebrow row
always carries one `Order State` instance, and the Cancelled badge becomes one
of its fourteen variants.

**The refiner order's title.** Jacob: *"once the order is no longer a draft,
just have a normal title like the others instead of the dropdowns; we can add
an edit button in the header."* So the Refiner and Location Selects appear
only on his Draft screens. A placed refiner order reads like every other
order — eyebrow `PURCHASE ORDER` / `SALES ORDER` with the Order State badge
beside it, title `Elemetal Refining`, `PO-2493 · Dallas, TX`, `12 orders to
date` — and gains an `Edit` tertiary at the left of the Cancel / Finalize row.
`Mode=Editing` swaps the Selects back in and replaces `Edit` with `Save` and
`Discard`.

**API for Edit.** `PATCH /api/refining/orders/:id { refiner_id, location_id }`
while the order is editable; the header is the only place either is changed
after placement.

**Card footer.** Jacob cut both of the proposal's footer lines — the payout
gate reason and the lots-by-position summary. The footer is now one line:
`5 lots · $18,420 est.` left, the date right (`Received Sep 2` for purchases,
`Placed Sep 2` for sales). The derived state is the badge in the card header
and nothing else, so `OrderListItem` needs neither `lots_by_position` nor
`payout_blocked_by` for this screen.

---

## 4. Screen copies

| screen copy | frame id | copy of | what it shows |
|---|---|---|---|
| `Sales Order (Refiner) · Settlement Pending` | `719:15329` | `320:2717` | his screen unchanged but for the four changes; refiner figures pre-filled from ours; aside Settlement badged `Pending assay` with `Record settlement` |
| `Sales Order (Refiner) · Settlement Settled` | `719:16091` | `320:2717` | refiner figures settled; aside Settlement badged `Settled` with `Dispute`, settled fine oz and variance filled |
| `Sales Order (Refiner) · Match lines open` | `719:16814` | `320:2717` | the dialog open over a scrim, centred in the first viewport |
| `Admin / Orders · state chips` | `673:20375` | `620:5115` | the list with the state-chip row and six cards on six derived states |

### Mobile

390 viewport, 358 content.

| frame | id |
|---|---|
| `Mobile · Settlement · Pending` | `721:17087` |
| `Mobile · Settlement · Settled` | `721:17154` |
| `Mobile · Settlement · Match lines` | `721:17220` |
| `Mobile · Order Cards` | `673:34763` |

His `Lots / Refiner` has no mobile twin, so the mobile frames carry the header
and the aside Settlement card only; the note frame on each says so.

Notes on canvas: `Draft note` `673:35312`, `Held · library limits` `673:35313`.

---

## 5. Apply at source — the list for Jacob

1. `Lots / Refiner` `338:10143` on the refiner sale order is titled
   `Settlement`; its Post Melt and Purity are the refiner's figures; the row
   sub-label drops the order number; a combined lot is one row.
2. `Settlement` `327:9783` gains `Record settlement` / `Dispute` in its title
   row beside the badge it already carries.
3. `Order Header` `292:5060` and `Order Header / Mobile` `292:5098` lose the
   `State` axis, carry an `Order State` instance, and gain `Edit` /
   `Mode=Editing` for refiner orders.
4. `Order Card (proposal)` `640:13045` swaps its two component badges for one
   `Order State` and drops both extra footer lines.
5. `Filter Bar (proposal A)` `626:11861` gains a state-chip row.

---

## 6. What the library could not draw

- **A dialog.** There is no dialog or scrim component in Themes and
  Components. `Match settlement lines` follows the pattern the Inventory draft
  established (scrim rectangle on `surface/background` at 70%, panel centred).
  If dialogs keep appearing, the shell belongs in the library.
- **A mobile refiner lots card.** He has no mobile twin of `Lots / Refiner`,
  and nothing was invented to stand in for one; the mobile frames say so.
- **A mobile Order Card.** He has none; the 358 twin here is new.
- Everything else is a library instance (Badge, Button, Icon Button, Input,
  Select, Checkbox, Radio Chip, Accordion) on bound tokens. No raw hex.

---

## 7. Still Jacob's

- **Approval.** Nothing is built from this until he says so.
- The combine lineage column (`combined_into_id`), still open from
  `orders-lots-proposal.md` §5.5 and now load-bearing for the one-row
  combined lot.
- Whether a refiner-combined group may span two customer purchase orders, or
  only lots from one.
- What "past tolerance" is, and whether it earns any treatment on the order
  screen at all — today it does not; variance lives on the lot screen.
- Whether `Record settlement` should refuse while our total and the refiner's
  differ, or only warn.
