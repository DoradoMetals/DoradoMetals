# Dorado Orders: design and integration notes

Working notes from Jacob's design sessions of Sep 4-5, 2026 (verbatim from his
document, lightly reflowed). Covers the Orders admin screens, the components
built for them (Themes and Components library, Orders file, Media file), and
the payments/integration discussion. Figma: Orders `ymmNlCDLVIfanpRQ7QHMIs`,
Inventory `LbLfI61Z1JHUfiSg24g8gG`, Media `WkbKhVaAYmxKTsbmAQEwmk`. These are
GUIDANCE for the API ("not fully finalized, the admin screens are pretty
close"); no frontend is built from them until Jacob says so.

## 1. Files

| File | What lives there |
|---|---|
| Themes and Components (library) | Tokens, base components, and the shared cards: Chat, Message, Call Event, Documents (formerly Paperwork), Tracker, Datepicker, Input, Badge, Button, Accordion, Tab Bar |
| Orders | Admin screens (desktop + one mobile), local order-page components on the `Components` page, and a "States: how to swap" note beside the desktop screen |
| Media | Documents (PDF layouts) and Mailers (emails) |
| PO Checkout | Customer checkout flow, referenced for the shipping fields, not edited |

Rules agreed: component fixes happen at the source, never on a screen
instance. Everything is tokenized. One base desktop screen and one base
mobile screen; every state is reached through instance swaps and variant
props. Accordion title rows: title left; buttons/badges/pickers right,
top-aligned. Badges follow one colour language for state: Warning -> Info ->
Success (pre -> mid -> post), Danger for problems, Neutral Outline for "not
set / draft / drop ship". Coloured figures carry no + / - sign.

## 2. Library changes (Themes and Components)

Tokens: soft alpha status tokens; `opacity/disabled` = 50, `opacity/muted` =
40; disabled = normal chrome at 50%; field value text 16px (iOS zoom).
Components: Badge/Button gap tokens; Input `State=ReadOnly` (full-contrast
value on `surface/muted`, no border; distinct from Disabled); Accordion
repaired; Tab Bar optional fourth tab (Create Fulfillment: Shipment / Pickup
/ Appointment / Return); Datepicker `Layout=Slim`; Tracker rebuilt as a
generic carrier log (horizontal `1fr 2fr 2fr 2fr 1fr`, vertical rail,
unscanned stages read "Pending"); Documents (renamed from Paperwork): four
rows, Available rows carry Send, Unavailable rows carry Import; canonical
document names: Invoice, Packing List, Return Packing List, Shipping
Instructions, Pickup Manifest, Pickup Instructions, Intake Receipt,
Appointment Instructions, Settlement, Lot Manifest. Chat (new): View
Messages/Calls x State Filled/Empty x Open; phone number under the title;
Calls view lists Call Event rows (Outgoing / No answer / Incoming / Missed)
with a full-width Call button; composer Attach (MMS), field, Send; ours right
(primary), theirs left; Message has Direction x Status
(Delivered/Sending/Failed).

## 3. Orders file components

| Component | Axes / states | Notes |
|---|---|---|
| Order Header (+ Mobile) | `Audience=Admin/External`, `State=Active/Cancelled` | Eyebrow (PURCHASE ORDER / SALES ORDER) with the Cancelled badge; name; `PO-#### · City, ST`; `N orders to date`. Admin: Assigned-to Select, Cancel Order + Finalize (Cancelled -> Reopen Order). External: no controls, order status badge. |
| Order Spots (+ Mobile) | `Spots=Unlocked/Locked` | Unlocked = live market, inputs read-only, "Lock Spots". Locked = frozen, editable, "Unlock Spots". Finalized: Locked + Unlock disabled. Collapsed shows `Gold $2,411.20`. |
| Items (+ Mobile) | `Kind=Scrap/Bullion`, `State=Editable/Finalized` | Scrap head: Item · Qty · Pre Melt · Post Melt · Purity · Premium. Bullion head: Item · Qty · Purity · Premium. Editable: Add New (reads Add Lot on refiner SOs). Finalized: inputs read-only, Add New hidden, Create Sale. Purity is a %; SO premiums are % of spot (e.g. 104). |
| Items / Adding Lot (+ Mobile) | standalone | Lot search (Autocomplete) in the title row with Add to Order beside it. |
| Items / Refiner | `Open` | Lot table: Item (with `Lot 2481-A · PO-2481` line) · Weight · Purity · Premium · Value. |
| Item Row | `Type=Scrap/Bullion` | Bullion hides melt inputs and adds a Qty input. |
| Charges (+ Mobile) | `Open`, `Show shipping`, `Show pool oz` | Payout/Payment Charge, Shipping Charge, Pool Oz Remediated (troy oz, ~0.003, refiner SOs only). |
| Payment (+ Mobile) | `State=Not sent/Processing/Sent/Due/Matching/Received` | Payout: Not sent (Warning) -> Processing (Info) -> Sent (Success); Send payment -> Processing -> Payment sent. Charge: Due (Warning) -> Processing -> Received (Success); Request payment / Mark received -> Matching (Autocomplete over unmatched inbound transactions + Confirm match). Payout states carry a Pay to account Select beside Method. |
| Totals | `Open` | Total payout / Total payment / Total due. |
| Profit Breakdown | `Open` | Collapsed shows profit only. |
| Settlement | `Open` | Refiner SO replacement for Profit Breakdown: Estimated fine oz · Settled fine oz · Variance · Assay lab · Expected settlement. Badge Pending assay -> Settled -> Disputed. |
| Fulfillment (+ Mobile) | `State=Empty` | "Fulfillment · Not set" with Empty State and Create fulfillment. |
| Create Fulfillment (+ Mobile) | `Method=Shipment/Pickup/Appointment/Return Shipment/Drop-off` | Shipment: Service · Package size · Handoff · Ship to · Ship from · Declared value · Coverage · Additional coverage (calendar = carrier pickup; disabled for dropoff). Return adds "Bill return shipping to the customer". Drop-off: Driver · Refinery · Window. |
| Shipment (+ Mobile) | `State=Label Created/Awaiting Tracking/In Transit/Delivered` | Awaiting Tracking (drop ship): Ships from/to + Carrier select + Tracking # + Save Tracking. In Transit/Delivered wrap the Tracker. |
| Return Shipment (+ Mobile) | `State=Label Created/In Transit/Returned` | Shipment in reverse for cancelled orders. |
| Pickup (+ Mobile) | `State=Scheduled/In Transit/Picked Up` | Window · Office · Driver · Pickup address. Cancel Pickup · Reschedule · Headed to Pickup / Mark Picked Up. |
| Appointment (+ Mobile) | `State=Scheduled/In Progress/Completed` | Date/Checked in · Office · With · Time. Cancel · Reschedule · Check In / Mark Complete. |
| Drop-off (+ Mobile) | `State=Scheduled/In Transit/Dropped Off` | Reverse pickup: we drive sealed lots to a refinery (or, one day, a customer). Headed to Refinery / Mark Dropped Off / Cancel Drop-off. |
| Linked Fulfillment (+ Mobile) | `Open` | Drop-shipped orders: "Fulfillment · Drop ship" with Ships from · Ships to · Linked order · that order's shipment state, and Open SO-####. Tracking lives on the linked order. |

Card notes are written for the operator, one line, plain. Mobile: one screen
(390 viewport, 358 content); each card has a Mobile twin.

## 4. Screens (Orders, Admin page)

- Admin / Purchase Order PO-2481 (Desktop + Mobile): the base. Customer sells us scrap.
- Sales Order (Admin): we sell bullion to the customer: Shipment · Awaiting Tracking (drop-shipped by the refiner), Items Kind=Bullion, Spots locked, Charges with shipping, Payment · Matching (customer's inbound wire/ACH/card), Totals -> Total due, Profit Breakdown, Messages.
- Sales Order (Refiner): we sell lots to a refiner: Drop-off, Spots locked (no lock button), Items with Add Lot, Charges: Payment Charge $20 + Pool Oz Remediated, Payment · Matching (wire to Dorado @ Truist), Totals -> Total payment, Settlement instead of Profit Breakdown, Documents: Invoice · Settlement (Import), no Messages.
- Purchase Order (Refiner): we buy bullion from a refiner: Linked Fulfillment (drop ship -> SO-1112), Items Kind=Bullion, Spots locked, Payment Not sent (wire to the refiner, Pay to select), Totals -> Total payment, Documents: Invoice (Import) · Packing List, no Messages / Profit.
- Sales Order (Refiner, external view): placeholder for the refiner-facing portal.
- Customer-facing screens removed; the customer portal will be designed separately.

Finalization rules: before -> Spots Unlocked, Items Editable, Add New shown,
Payment Not sent with Send disabled. After -> Spots Locked + Unlock disabled,
Items Finalized (read-only, Create Sale), Payment Sent/Received, Finalize
disabled ("Finalized").

Documents by method: Shipment -> Invoice · Packing List · Return Packing List
· Shipping Instructions. Pickup -> Invoice · Pickup Manifest · Pickup
Instructions. Appointment -> Invoice · Intake Receipt · Appointment
Instructions. Refiner SO -> Invoice · Settlement. Invoice is Unavailable
until finalized.

## 5. Media file

Documents page: Pickup Manifest and Intake Receipt (pre-fulfillment
documents on the Packing List skeleton; details block = Customer / Pickup or
Office / Appointment; no From/To route, no signature). Instructions · Pickup
and Instructions · Appointment (customer-facing sheets on the Shipping
Instructions layout; the Texas photo-ID line is a placeholder claim).
Mailers page: Pickup booked · Pickup complete · Appointment booked ·
Appointment tomorrow; Mailer · Document sent (Title, Lead, Document, Format,
Sent, Button props).

## 6. Payments and integrations

Payment states map to provider events. Payout: Not sent -> Processing -> Sent
(Send payment -> provider webhook). Charge: Due -> Processing -> Received;
Matching is the manual reconciliation fallback. Provider-agnostic.

Reconciling inbound money to an order: 1. virtual account numbers per order
(exact match: Modern Treasury, Increase); 2. reference in memo (`SO-####`):
strong hint, not proof; 3. heuristic: amount ± $0.50 + counterparty + memo:
pre-select, don't auto-confirm; 4. manual: store every inbound transaction as
unmatched; the Matching picker lets the admin choose. Day-one floor.

Vendor findings: Modern Treasury (best fit, enterprise-priced, sales-led);
Increase (self-serve, ACH/wire, virtual accounts, webhooks); Plaid (data
products self-serve; Plaid Transfer underwritten, ACH-only, uncertain;
cannot link a refiner's account without the refiner logging in); Moov (most
promising rail: ACH standard/same-day, RTP/FedNow, push-to-card, cards,
wallets; counterparty vaulting; webhooks; self-serve sandbox; pay-as-you-go;
precious metals not prohibited; NO wires; money moves through a pre-funded
Moov wallet; bank linking native micro-deposits or instant via Plaid/MX
token); Stripe (cards only; Connect needed for third-party payouts; precious
metals restricted; not load-bearing for outbound); Mercury (industry
restrictions); Truist (banks us already; ask about ACH origination and
feeds; wires stay here).

Industry note: precious-metals dealers are financial institutions under the
BSA (31 CFR Part 1027) with AML obligations, a FATF high-risk category.

Working plan:

| Need | Provider |
|---|---|
| Card payments in (sales orders) | Stripe: `payment_intent.succeeded` -> Received |
| ACH / instant payouts out (customers, refiners) | Moov: status events -> Processing / Sent |
| ACH / RTP in (bank payment on sales orders) | Moov |
| Customer instant bank linking | Plaid Link -> processor token -> Moov (micro-deposits fallback) |
| Refiner bank details | vendor form -> vaulted at Moov (never in our DB) |
| Wires (large refiner settlements) | Truist portal; mark Sent manually |
| Watching our Truist account for Matching | Plaid Transactions |
| Later, at volume | Modern Treasury / Increase / direct bank partnership behind the same states |

Plaid and Moov to be added together.

## 7. Open items

Publish the library; Payment · Adding Account state (proposed); refiner-facing
views; customer portal (fresh design); Empty State ruling; Texas photo-ID;
Settlement variance per lot; Finalize gate: document what unblocks Finalize
(items priced, spots locked, fulfillment state).
