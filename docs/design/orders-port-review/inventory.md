# Orders file inventory (read live 2026-10-14 ~21:10Z by the Orders worker)

File `ymmNlCDLVIfanpRQ7QHMIs`. The porting page holds 23 screens (an earlier reply said 24; node counts matched on the move, nothing is lost).

## Page "Orders" 660:10613 — 5 base screens (all desktop 1440)

- 620:5115 Admin / Orders & Lots | list | desktop | Purchases tab, Customers, 2 orders selected (batch bar)
- 168:2022 Admin / Purchase Order - PO-2481 | customer purchase | desktop | active, no badge, Spots unlocked
- 358:4893 Sales Order (Admin) SO-1112 | customer sale | desktop | active, no badge, Spots locked
- 320:2717 Sales Order (Refiner) RS-2493 | refiner sale | desktop | active, no badge
- 358:6416 Purchase Order (Refiner) · Sent RP-2493 | refiner purchase | desktop | sent, no badge

Loose components on this page: 1035:21970 Selection actions · Orders; 1047:22078 / 1048:31893 Dialog body · Match settlement lines (Desktop/Mobile); 1048:32236 / 1048:32375 Dialog body · Adopt refiner assay (Desktop/Mobile). These bodies now fill the Drawer body slot.

## Page "Order states · for porting" 1157:22583 — 23 screens

List (1157:22584):
- 620:5789 Admin / Orders & Lots - Sales | list | desktop | Sales tab
- 634:12204 Admin / Orders & Lots - Refiners | list | desktop | Refiners filter
- 634:13082 Admin / Orders & Lots - Completed | list | desktop | Completed
- 917:13005 Mobile · Orders & Lots | list | mobile | Purchases, selection bar
- 673:20375 Admin / Orders · state chips | list | desktop | proposed state-chip filter row

Customer purchase PO-2481 (1157:22585):
- 729:35427 PO-2481 · Adopt refiner assay | desktop | badge At Refiner | DRAWER LG open, from Lots card title row (Adopt refiner assay)
- 834:21175 PO-2481 · Profit Breakdown | desktop | badge Ready to Pay | profit card
- 729:36280 Mobile · Adopt refiner assay | mobile | At Refiner | DRAWER Full open, same source
- 834:21442 Mobile · Profit Breakdown | mobile | Ready to Pay

Refiner sale RS-2493 (1157:22586):
- 396:4895 Draft Sales Order (Refiner) | desktop | draft (refiner + location selects)
- 719:15329 Settlement Pending | desktop | Pending Assay
- 719:16091 Settlement Settled | desktop | Settled (paid)
- 743:38918 Settlement Pooled | desktop | Settled (pooled)
- 719:16814 Match lines open | desktop | Pending Assay | DRAWER MD open, from Documents card Settlement row Import
- 721:17087 Mobile · Settlement · Pending | mobile | Pending Assay
- 721:17154 Mobile · Settlement · Settled | mobile | Settled
- 743:39626 Mobile · Settlement · Pooled | mobile | Settled (pooled)
- 721:17220 Mobile · Settlement · Match lines | mobile | Pending Assay | DRAWER Full open, same source

Refiner purchase RP-2493 (1157:22587):
- 380:4833 Draft Purchase Order (Refiner) | desktop | draft
- 729:34954 Linked orders | desktop | Awaiting Delivery | drop ship, linked customer orders
- 729:36214 Mobile · Linked orders | mobile | Awaiting Delivery
- 849:32453 Ships to us | desktop | Awaiting Delivery | own inbound shipment
- 849:32937 Mobile · Ships to us | mobile | Awaiting Delivery

## Components (sections on the Orders page; the "Components · Orders" wrapper was removed today)

661:7706 Orders · order screen cards:
- 170:2226 Spots / 170:2395 Spots / Mobile — locked or unlocked spot per metal; shows only the order's metals
- 170:2260 Lots / 170:2421 Lots / Mobile — customer order lots table / list
- 152:548 Lots Row / 158:1175 Lots Row / Mobile — one lot line (scrap or bullion)
- 326:9499 Lots / Adding Lot (+ Mobile 326:9911) — lots card while a lot is being added
- 338:10143 Lots / Refiner — refiner order lots table (17 variants)
- 398:9871 Item Row / Refiner — one lot on a refiner order
- 170:2277 Charges / 170:2438 Mobile — order charges
- 170:2316 Payment / 170:2477 Mobile — payout or payment method and state (11 variants)
- 170:2346 Totals — order money summary
- 170:2373 Profit Breakdown — UNSETTLED / SETTLED lots (Link to lot) + FEES + profit
- 327:9783 Settlement — refiner settlement aside on a sale
- 209:3010 Fulfillment / 209:3088 Mobile — empty fulfillment slot, create entry
- 237:4619 Create Fulfillment / 237:5179 Mobile — one card to create any fulfillment
- 179:2460 Shipment / 179:2570 Mobile — shipment card
- 296:5324 Return Shipment / 296:5601 Mobile — shipment back to the customer
- 184:2846 Pickup / 184:3124 Mobile; 195:2924 Appointment / 195:2925 Mobile; 319:5963 Drop-off / 319:6159 Mobile — other fulfillment methods
- 371:8332 Linked Fulfillment / 371:8408 Mobile — goods move on another order

661:7707 Orders · list:
- 618:4776 Order Card — one order in the list grid
- 626:11861 Filter Bar (proposal A) — bottom bar when selection exists
- 619:4639 Filter Rail — list filters
- 619:4750 Order Context Menu — right-click actions on a card

664:11577 Draft · Orders · 2026-09-11 (proposals, placed on the state screens):
- 664:12789 Order State — derived order status badge (14)
- 671:28586 Order Card · proposed / 671:28777 Mobile — card with state badge
- 715:38985 Filter Bar · proposed — with state-chip row
- 728:45748 Linked Fulfillment · proposed — list of linked customer orders
- 729:17246 Lots · proposed — Lots with an "Adopt refiner assay" action
- 741:46678 Item Row / Refiner · proposed; 741:47884 Lots / Refiner · proposed — with a settlement column
- 742:20760 Settlement · proposed / 743:20841 Mobile — settlement card states (Pending/Settled x Paid/Pooled)
- 833:21320 Profit Breakdown · proposed / 833:21499 Mobile — Estimated/Realized bases
- 1088:22538 Dialog body · Payout override; 1088:22690 Payout override · requires a reason — a DIALOG (not converted to a drawer; it opens on a second payout or a payout above the total; Jacob not asked yet)
- 1102:22810 Entity identity · Refiner and location — draft header identity slot
- 710:49549 Match settlement lines; 729:17608 Adopt refiner assay — OLD dialog wrappers, 0 instances, kept until Jacob says delete

## Changed in the last day (re-read live)

- 168:2022: Spots metals; Profit Breakdown (lot links, payout removed, UNSETTLED/SETTLED, FEES split, header "4 of 5 settled"); button re-hug
- 358:4893: Spots; Documents icon spacing; Chat switcher (library fix published 20:08, not yet accepted in this file: gap still 2)
- 320:2717, 358:6416: Spots metals
- 729:35427, 729:36280, 719:16814, 721:17220: dialog -> library Drawer
- 834:21175, 834:21442, and every card using Profit Breakdown / proposed: profit changes
- All 8 mobile state screens: header badge un-justified; Edit button rows centred
- Whole file: token sweep (gaps, paddings, text styles), hug/fill sweep, hairlines bound to stroke/hairline

Open, waiting on Jacob: accept the spot-lock consequence (a later metal prices at discovery time); delete the 2 old dialog sets; drawer description lines back or not; fees section keep or remove; accept the library update (Chat).
