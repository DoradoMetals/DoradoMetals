- 1974187921 (pin 0:1, "published and added all libs"): Library and Orders published, libraries enabled; worker starts the ruling 168 moves into Inventory and Fulfillment.

## 2026-10-20 (sixth worker)
- 1974187921 ("published and added all libs"): the Library is published. All Orders fulfillment components are still CHANGED: Create Fulfillment 237:4619 / 237:5179, Fulfillment 209:3010 / 209:3088, Shipment, Return Shipment, Pickup, Appointment, Drop-off, Linked Fulfillment, Create Fulfillment · Drawer 1270:27868 and Void label · confirm. Method Tile 1282:20334 and Create Order Drawer/Body · Fulfillment 1293:25217 / 25218 are UNPUBLISHED. The move would copy stale versions, so nothing is moved yet; Jacob is asked to publish the Orders file. Reply 1974194461.
- 1974221928 (in 1974187921, "should be there now..?"): Orders published; worker runs the remaining ruling 168 moves.
- Move done after the Orders publish (1974221928). Page "Page 1" renamed to Components. 11 sets sit at the page root, with no parent, no unbound properties and no overlaps:
  - Method Tile 8:703 (from the published fulfillment-only key)
  - Shipment 8:3346 (16 variants), Return Shipment 8:4750, Pickup 8:5807, Appointment 8:6632, Drop-off 8:7443 (12 each)
  - Create Fulfillment 8:12005 (10), Create Fulfillment · Drawer 8:17650 (10)
  - Fulfillment 8:20289 (12), Linked Fulfillment 8:20954 (10), Void label · confirm 8:21202 (2)
  - Desktop/Mobile pairs are merged with a Layout axis. 10 nested instances are swapped to the local sets.
- Not found as components in Orders: handoff/booking chips, a tracking timeline (it is the Library Tracker inside the cards) and a fulfillment status badge (Library Badge).
- Open: Orders now holds a merged Method Tile 1371:53637 (Fulfillment + Payout + Any). After the publish, its Fulfillment variants re-point to this file and the Payout variants stay in Orders.
- Fresh renders of 8:3346 and 8:12005 checked. Reply 1974253763.

## 2026-10-20 (seventh worker)
- Ruling 171 (pages are the navigation, with the fix-pass rules): snapshot tools/fulfillment/snapshots/fulfillment-full-tree-pre-ruling171-2026-10-20.json (version 2412546567478673842); renames ruling171-set-renames-2026-10-20.txt. No screens, so one divider "──── Components (Fulfillment) ────" 11:5329. Pages: Create 0:1 (was "Components"; Drawer 8:17650, Form 8:12005, Method tile 8:703), Methods 11:5330 (Shipment 8:3346, Return shipment 8:4750, Pickup 8:5807, Appointment 8:6632, Drop-off 8:7443), Cards 11:5331 (Card 8:20289, Linked card 8:20954, Void label confirm 8:21202). 7 sets renamed. No sections existed; nothing deleted. Positions packed from the origin, 200 px gap. REST diff: 7314 -> 7314, no ids missing or new; COMPONENT 116 and SET 11 unchanged; 2100 instances, 0 unresolved; property names unchanged. Fresh 2x renders checked: pages 0:1 and 11:5331. Root comment 1974369910 on 8:17650.
