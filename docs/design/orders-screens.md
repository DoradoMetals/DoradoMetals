# Orders screens: intake, settlement, and the derived order state

Drafted 2026-09-11 for Jacob's approval (ruling 96: no frontend component
without a Figma design he approved; ruling 103: an agent may draft, he
approves). Everything below is DRAWN and waiting on him. No code is written.

Figma file **Orders** `ymmNlCDLVIfanpRQ7QHMIs`. Two draft sections:

| section | page | id |
|---|---|---|
| `Draft · for review · 2026-09-11` (screens, mobile frames, notes) | Orders | `664:11578` |
| `Draft · Orders · 2026-09-11` (new local components) | Components | `664:11577` |

**Not one node of his was modified, renamed or moved.** Every proposal is a
COPY built from library instances and tokens. His source sets were re-read
after the pass and are unchanged: `292:5060` `292:5098` `170:2260` `170:2421`
`152:548` `158:1175` `327:9783` `626:11861` `618:4776` `640:13045`.

What it answers: the "received" gap that `docs/design/statuses.md` §2/Q3 names
(nothing records receipt, so `on hand` is underivable and the `on_assay`
payout policy has nothing to gate on), the per-lot settlement variance that
`orders-notes-2026-09-05.md` §7 left open, and the derived display state that
`statuses.md` §3 proposes.

---

## 1. Components

### Intake

| component | frame id | states | source | what the API must provide |
|---|---|---|---|---|
| `Lots · proposed` | `668:15298` | `Kind=Scrap\|Bullion` × `Received=Awaiting\|Receiving\|Received` — `668:13913` `668:14215` `668:14493` `668:14768` `668:14944` `668:15122` | **apply at source** on `Lots` `170:2260` | `received_at` + `received_by` on the INBOUND fulfillment (statuses.md §4 recommends the fulfillment, not the lot or the order). Card reads it three ways: absent + parcel undelivered → Awaiting; absent + delivered → Receiving; present → Received. Needs `POST /api/fulfillments/:id/receive { lot_ids[] }`. |
| `Lots · proposed / Mobile` | `670:14936` | same six — `670:13658` `670:13898` `670:14117` `670:14336` `670:14536` `670:14736` | **apply at source** on `Lots / Mobile` `170:2421` | same |
| `Lots Row · proposed` | `665:11605` | `Type=Scrap\|Bullion` × `Received=Awaiting\|Receiving\|Received` — `665:11606` `667:11657` `667:11673` `665:11621` `667:11689` `667:11705` | **apply at source** on `Lots Row` `152:548` | per-lot in-house assay write: `PATCH /api/lots/:id { pre_melt, post_melt, purity }` with a `received` flag, plus `LotView.position` (inventory-model §1) for the Position badge and `LotView.declared_*` for the Variance figure. Variance is COMPUTED server-side, not typed. |
| `Lots Row · proposed / Mobile` | `670:13183` | same six — `670:13184` `670:13471` `670:13481` `670:13193` `670:13491` `670:13500` | **apply at source** on `Lots Row / Mobile` `158:1175` | same |

**What changes in the card.** The title row gains one control per state:
`Awaiting delivery` (Badge, Warning Soft) → `Mark received` (Button, Primary)
→ `Received · Sep 11 · Dana` (Badge, Success Soft). The head's last two
columns, `Premium` and `Price`, become `Variance` and `Position` — intake is
an assay, not a price, and the swap is column-for-column so the table geometry
is untouched (872 wide either way). Rows carry a per-row check in `Receiving`,
read-only inputs otherwise, and a position badge that reads `Incoming` before
receipt and `On Hand` after. A Variance beyond tolerance is `text/danger`.

### Settlement

| component | frame id | states | source | what the API must provide |
|---|---|---|---|---|
| `Settlement · proposed` | `671:16072` | `Pending` `671:14414` · `Imported` `671:14832` · `Settled` `671:15247` · `Disputed` `671:15660` | **new** (replaces the order-level `Settlement` `327:9783` on the refiner sale order) | per-lot settlement write: `PATCH /api/refining/lots/:id { settled_weight, settled_purity }` (settled fine oz is generated, like `content`), plus `refining.orders.refiner_reported_content` for the footer input and a rules check that raises when our sum and the refiner's differ. `Import settlement` = `POST /api/refining/orders/:id/settlement-import` (PDF in, inputs pre-filled, employee confirms — the write happens on `Record settlement`, never on import). `Dispute` = the existing `disputed_at`. |
| `Settlement · proposed / Mobile` | `671:23784` | `671:22415` `671:22760` `671:23105` `671:23445` | **new** | same |
| `Settlement Row · proposed` | `670:18873` | `Pending` `670:18663` · `Imported` `670:18732` · `Settled` `670:18779` · `Disputed` `670:18826` | **new** | `RefiningLotView` needs `sent_weight`, `est_purity`, `est_fine_oz`, `settled_weight`, `settled_purity`, `settled_fine_oz`, `variance`. Six of the seven already exist on `refining.lots` (`pre_melt`/`post_melt`/`purity`); the settled trio and the variance are the addition. |
| `Settlement Row · proposed / Mobile` | `671:22180` | `671:21986` `671:22045` `671:22102` `671:22141` | **new** | same |

**What changes.** The card moves from the 400-wide **aside** to the 952-wide
**main** column — nine columns cannot live in the aside, and the aside keeps
Totals and Documents. Columns: `Lot · Item · Sent weight · Est. purity ·
Est. fine oz · Settled weight (input) · Settled purity (input) · Settled fine
oz (computed) · Variance`. Footer: our total fine oz, the refiner-reported
input, and a match check that reads `Totals differ by 0.12 oz` in Danger when
they disagree and `Totals match` in Success when they do. Title row: badge
`Pending assay` / `Settled` / `Disputed`, with `Import settlement`
(secondary), `Record settlement` (primary) and `Dispute` (tertiary, Danger).
`Imported` adds one banner line, `Imported from Elemetal PDF · confirm`.

### Derived order state

| component | frame id | states | source | what the API must provide |
|---|---|---|---|---|
| `Order State` | `664:12789` | 14, one axis. Purchase: `Awaiting Receipt` `664:12714` → `Awaiting Payout` `664:12720` → `At Refiner` `664:12725` → `Ready to Pay` `664:12731` → `Completed` `664:12767`. Sale: `Awaiting Payment` `664:12736` → `Preparing` `664:12741` → `In Transit` `664:12746` → `Completed`. Refiner sale: `Pending Assay` `664:12751` → `Settled` `664:12761` / `Disputed` `664:12772`. Refiner purchase: `Awaiting Delivery` `664:12756` → `Awaiting Payment` → `Completed`. All: `Draft` `664:12783`, `Cancelled` `664:12778`. | **new** | the derived state view (statuses.md §3): `orders.orders.status` narrows to `draft \| open \| cancelled` and one SQL `CASE` — on the model of `refining/orders/sql/view_one.sql` — projects the display state from payout/charge `state`, fulfillment state and lot positions. One expression, one place; `OrderView.state` and `OrderListItem.state` both read it. `OrderActions.statuses` is dropped (nothing reads it). |
| `Order Header · proposed` | `671:26494` | `Audience=Admin, Party=Customer` `671:26436` · `Audience=External, Party=Customer` `671:26457` · `Audience=Admin, Party=Refiner` `671:26472` | **apply at source** on `Order Header` `292:5060` | `OrderView.state` |
| `Order Header · proposed / Mobile` | `671:28373` | `671:28323` `671:28340` `671:28354` | **apply at source** on `Order Header / Mobile` `292:5098` | same |
| `Order Card · proposed` | `671:28586` | `Selected=false\|true` × `Direction=Purchase\|Sale` — `671:28446` `671:28470` `671:28494` `671:28518` | **apply at source** on `Order Card (proposal)` `640:13045` | `OrderListItem.state` |
| `Order Card · proposed / Mobile` | `671:28777` | `Direction=Purchase` `671:28731` · `Direction=Sale` `671:28754` | **new** (he has no mobile twin of the card) | same |
| `Filter Bar · proposed` | `672:16525` | `Set=Purchases` `672:16460` · `Set=Sales` `672:16494` | **apply at source** on `Filter Bar (proposal A)` `626:11861` | `GET /api/orders?state=` (repeatable) over the derived state, and a count per chip. Indexable — the state is derived, so the filter is a `WHERE` with no `exchange` index behind it; `audit:query-paths` is the guard. |

**What changes in the header.** The `State=Active/Cancelled/Sent` axis goes
away. The eyebrow row always carries one `Order State` instance, and the
existing Cancelled badge becomes one of its fourteen variants — which is what
lets one component say `Cancelled`, `Draft` and every derived rung without a
new axis per kind. **What changes in the card.** The separate `Payment` and
`Fulfillment` badges collapse into the one derived state they are already a
projection of; the parts stay on the order screen, where they are actionable.

---

## 2. Screen copies

Each is a full copy of his screen with the proposed cards instanced, so the
whole page reads correctly.

| screen copy | frame id | copy of | what it shows | what the API must provide |
|---|---|---|---|---|
| `PO-2481 · Lots · Awaiting` | `672:25133` | `168:2022` | parcel not delivered: rows read-only, badge `Awaiting delivery`, header `Awaiting Receipt` | `received_at` absent, inbound fulfillment not delivered |
| `PO-2481 · Lots · Receiving` | `672:25846` | `168:2022` | parcel delivered: `Mark received`, per-row check, assay inputs live, per-row Variance (one Danger) | the receive call, the assay patch, the computed variance |
| `PO-2481 · Lots · Received` | `672:26464` | `168:2022` | receipt recorded: `Received · Sep 11 · Dana`, inputs read-only, rows read `On Hand`, header `Awaiting Payout` | `received_at` + `received_by`; `LotView.position` flips to `on hand`, which is what unlocks the `on_assay` payout policy |
| `Purchase Order (Refiner) · Receiving` | `672:32698` | `358:6416` | bullion arriving from a refiner, same intake card, `Kind=Bullion`; variance is a count check (`Qty −1`, Danger) | same receive call against the refiner purchase order's inbound fulfillment |
| `Sales Order (Refiner) · Settlement Pending` | `672:33471` | `320:2717` | settlement grid in the main column, inputs pre-filled with estimates in placeholder style, footer `Awaiting assay` | the per-lot settlement read |
| `Sales Order (Refiner) · Settlement Settled` | `672:34316` | `320:2717` | read-only, Success, `Totals match`, header `Settled` | the per-lot settlement write and `settled_at` |
| `Admin / Orders · state chips` | `673:20375` | `620:5115` | the list with the state-chip row and six cards on six different derived states | `OrderListItem.state`, `?state=` filter |

### Mobile

390 viewport, 358 content, following his Mobile twins. There are no mobile
screens in the file, so these are viewport frames holding the mobile twins.

| frame | id |
|---|---|
| `Mobile · PO-2481 · Awaiting` | `673:33662` |
| `Mobile · PO-2481 · Receiving` | `673:33854` |
| `Mobile · PO-2481 · Received` | `673:34046` |
| `Mobile · PO Refiner · Receiving` | `673:34238` |
| `Mobile · Settlement · Pending` | `673:34391` |
| `Mobile · Settlement · Settled` | `673:34579` |
| `Mobile · Order Cards` | `673:34763` |

Notes on canvas: `Draft note` `673:35312`, `Held · library limits` `673:35313`.

---

## 3. Apply at source — the list for Jacob

1. `Lots` `170:2260` and `Lots / Mobile` `170:2421` gain a `Received` axis.
2. `Lots Row` `152:548` and `Lots Row / Mobile` `158:1175` gain the same axis;
   `Premium` and `Price` give their columns to `Variance` and `Position`.
3. `Order Header` `292:5060` and `Order Header / Mobile` `292:5098` lose the
   `State` axis; the eyebrow row carries an `Order State` instance.
4. `Order Card (proposal)` `640:13045` swaps its two component badges for one
   `Order State`.
5. `Filter Bar (proposal A)` `626:11861` gains a state-chip row above the
   controls.
6. `Settlement` `327:9783` is superseded on the refiner sale order by the
   per-lot grid, and the card moves from the aside to the main column.

---

## 4. What the library could not draw

- **An in-card banner.** The library `Banner` (`bf0ba82b…`) is a full-bleed
  128px page band. The `Imported from Elemetal PDF · confirm` strip is
  composed from `status/info-soft` + `text/info` + `radius/md` instead. If
  that strip earns a place, it wants a small `Callout` component in the
  library rather than a one-off.
- **Bullion assay columns.** His `Lots` card hides `Pre Melt`, `Post Melt` and
  `Purity` on `Kind=Bullion`, so the refiner-purchase intake reads as a count
  check only. That may be right (the purity is stamped) — but if an inbound
  bullion weight check is wanted, those columns have to be unhidden at source.
- **A mobile Order Card.** He has none; the 358 twin here is new, and its foot
  wraps where his 336 desktop card does not.
- No other element is hand-made: every control is a library instance (Badge,
  Button, Input, Checkbox, Radio Chip, Select, Accordion) and every colour,
  radius and space is a bound token.

---

## 5. Still Jacob's

- **Approval.** Nothing is built from this until he says so.
- Whether the payout policy switch (`after_settlement` → `on_assay`,
  inventory-model §3) flips the moment `Received` exists, or waits.
- Whether `Variance` tolerance is a setting per metal, per lot kind, or a flat
  percent. The screens draw the Danger state; nothing draws the threshold.
- Whether `Import settlement` accepts only Elemetal's PDF shape at first, or
  a generic CSV beside it.
- Whether the derived `Completed` for a customer purchase waits on every lot
  reaching `pooled`/`sold` (statuses.md §2/Q2) or only on the payout.
