# Figma worker handoff (2026-10-19)

Written by the Figma worker for all eight files. Read first: docs/design/worker-protocol.md, rulings 152 to 157, and the 2026-10-16 handoff. Item-by-item detail is in library-comments-log.md and people-comments-log.md (section "2026-10-19").

## 1. The Library Table as it stands now (Library 8A73quhBLBqotJlX95jN9j, page Table)

**Rule (Jacob, thread 1972258176)**
- The Table owns only what every table shares: the title row, the body and the footer.
- Search, filters and sort belong to the page. On list screens they go in the Admin Header. Inside cards, the feature composes its own row and puts it in the Table Header's toolbar slot.
- No feature examples live in the Library.

**Table 1101:444**
- Axes: In card × Layout (Desktop, Mobile) × State (Default, Empty, Loading, Error) × Scrolling (Paginated, Virtualized).
- Switches: Show header, Show footer, Show select column, Show col 5 to Show col 10, Show row actions, selection bar, group rows, expand column, expanded row.
- Mobile rows are a passthrough slot, "Mobile row".
- Column heads row: fill surface/card in all 10 desktop variants, with a bottom hairline.
- Problem: the set description is stale. It still lists the old header search and chips. Rewrite it.

**Table Header 1172:254**
- Variants: Layout=Desktop 1181:5785 and Layout=Mobile 1172:189. The Arrangement A/B/C axis is gone.
- Contents: Title row (Title, Selected count, Spacer, Actions), Divider, then Toolbar.
- Toolbar: one INSTANCE_SWAP "Toolbar#1210:0", whose default is the Slot placeholder 1210:6550. "Show toolbar" is off by default.
- Properties: Show toolbar, Title, Actions (swap), Show actions#1210:13, Show selected count, Selected count.
- Padding: the root has none. Title row and Toolbar use spacing/sm, so the divider is the bottom edge when the toolbar is off.
- Pre-delete snapshot: tools/library/snapshots/table-header-slot-pre-2026-10-19.json.

**Table Actions 1186:1440** (Selection=None / Selected)
- Icon Buttons, Size=Default, HUG.
- Order: Export (download), Assign (user-plus), Convert (user-check), Delete (trash-2, Danger), New (plus, Primary).
- Switches: Show export, Show assign, Show convert, Show delete, Show new (renamed from Show primary; default off), and a hidden Show icon button.
- Assign, Convert and Delete are enabled only in Selected. New is disabled in Selected.

**Table Head 1176:1238**
- Label, Align. Sortable is off by default.
- Table Sort 1171:109 states:
  - None: chevrons-up-down in text/muted.
  - Asc: arrow-up-narrow-wide in primary/default.
  - Desc: arrow-down-wide-narrow in primary/default.

**Table Row 56:33**
- Columns: Fixed or Cells. Cells use Table Cell 1120:4194 (Text, Muted, Link, Badge).
- States: Hover is surface/highest; Selected is surface/raised. There is no Selected+Hover variant. Mobile has Default only.

**Table Footer 1172:298**
- Range is now separate pieces: "Showing" + Shown#1195:0 + "of" + Total#1195:3. The numbers are text/default, the words text/muted.
- Other switches: Show range, Show pagination, Show page size, Show selection count, Show link.

**Standalone controls**
- Multiselect 1183:127.
- Select 38:75.
- Chip 32:121.
- Radio Chip: published set key fe8e5177….
- Date Picker 1208:898:
  - States: Default 1208:573, Filled 1208:633, Open 1208:660, Disabled 1208:853.
  - Has a Label#1218:0 property.
  - Calendar segment: secondary/default fill, rounded on the left only.
  - Field is a Popover set to Open=False.
  - The Open state is a "Control and panel" frame holding a Date Range Panel instance.
- Date Range Panel 1208:385: the Calendar plus Clear and Apply. The preset chips are removed.
- Calendar Day 47:21 has a new state, In range 1208:383, filled with the new token primary/soft (primary at alpha 0.16).
- There is no separate Sort select component. A sort control is a plain labelled Select.

**Admin Header (Headers page)**
- 730:8 and Admin Header / Mobile 734:269 each gained "Show filter slot" (default off) and "Filter slot" (a swap) after Select 2.
- The mobile Chips frame 795:61 now wraps.

**Other Library state**
- Tables in use 1179:9297: the intro states the rule. The Leads row reads "Ported" (green badge).
- Field token field/search = 320 in Scale. Nothing uses it now.
- Removed today, with snapshots on disk:
  - The Leads frame 1172:5649.
  - The examples, and the .Example rows 1177:1539 and 1172:5637.
  - The B and C header variants.
- Jacob's own sketch is still on the Table page: 1189:2860, 1189:2861, 1189:2862, 1189:2875, 1189:2879. Do not delete it without his word.

## 2. People Leads port (People 5cEytffOkxIfqdRWFaTWpl, page Leads)

**Desktop: Admin / Leads 34:2477**
- The Library Table is instance 502:3885 in Left 357:5783.
- Columns: Name (sortable), Source, Status (badge), Assigned to, Estimated value (sortable, right-aligned), Created (sortable, active Desc).
- Footer reads "Showing 4 of 48" with pagination. The toolbar is off.
- Actions: Export, Assign, Convert, Delete. Show primary is off.
- Page Header 34:2480:
  - Selects 1 to 4 are off. The filter slot holds Leads filters.
  - Show action is on, labelled "New lead". The search reads "Name, phone or email".
- The old list instance 205:3755 is removed. The local set 205:3754 is kept.

**Mobile: Mobile · Leads 34:2661**
- Content: Page Header / Mobile (local 202:3699), then Leads filters Mobile 504:8742, then a Library Table mobile instance 504:8781.
- The table's Mobile row is Lead Row / Mobile; its footer reads "Showing 4 of 48".
- The old Filters / Mobile 203:4050 and list 205:3990 are removed.

**Leads filters 503:3422** (section "Leads · Filters" 502:10120)
- Desktop 502:9863: Source, Assigned to, Status radio chips (minHeight control/lg 44), Created Date Picker.
- Mobile 503:3385: the same controls stacked.
- No Sort control.

**Lead Row / Mobile 151:5433**
- Name + stage, Source, Since created, Estimate.
- Priority is hidden. The globe icon was removed on Jacob's word.

**Known gap:** mobile still uses the local Page Header / Mobile, so there is no New lead on mobile. Ask Jacob whether to switch it to Admin Header / Mobile.

Snapshots: tools/people/snapshots/leads-table-port-pre-2026-10-19.json and tools/people/snapshots/lead-row-mobile-pre-2026-10-19.json.

## 3. Waiting on the next Library publish (only Jacob publishes)

- The last publish was 18:37 today. Since then the following changed: column-head fill, row Hover/Selected, the Date Picker trigger and Open state, In range plus primary/soft, the preset-chip removal, and the Table Actions "Show new" rename and default.
- After the publish:
  - In People Leads filters (both layouts), set "Created" on the Date Picker's Label property. The old Field label is now hidden.
  - Check that the new row and head colours appear on 34:2477.
  - Clear explicit Icon Button heights if any appear.
- Due now, not done: Orders Activity 1207:15065 and Refunds 1207:15238 lost their head labels (the old Head 1-6 TEXT properties). Re-set the labels from tools/library/snapshots/orders-table-heads-pre-publish-2026-10-16.json.

## 4. Open threads

- **Library 1972306358** (pin 732:65 @1296,252, Headers page): "this number or info or whatever should probably be filter specific. Otherwise we're showing the same thing twice."
  - Unanswered. The loop already advanced the Library high-water past it.
  - Likely meaning: the Admin Header count next to Reset should reflect the active filters.
- **People 1970296424:** Assigned Work card question. No answer since 10-16.
- **People:** inline Upload removal. Waiting.
- **People:** four superseded sets, recorded in tools/people/snapshots/superseded-2026-10-16.json. Waiting for his word to delete.
- **Library:** Narrow y axis on Chart / Line. Probably redundant now; no answer.
- **Library:** Jacob's sketch on the Table page. Left in place.
- **Admin Header filter bar vs table header:** answered by the toolbar-slot rule (thread 1972258176, "Yes go for it").
- **Orders:** Mark returned states question on 1235:25741. No answer.

## 5. Lessons from today

- A variable-bound fill can render with a stale literal colour, or lose its paint opacity in instances.
  - Fix: re-set the paint with the resolved colour.
  - For alpha, make a token (primary/soft); do not use paint opacity.
- clone() of a variant or frame drops property references. Re-link them by walking the original and the clone in parallel.
- swapComponent carries overrides. A swapped Popover kept its hidden Panel and its Label override.
- Instance subtrees can be unmaterialised (children []). Read them by id path ("I<inst>;<child>"). If that fails, use resetOverrides and re-apply the properties.
- use_figma batches are atomic: a thrown error rolls back the whole batch.
- Jacob deletes and resizes canvas items live. Re-read structure before every batch, and never recreate what he removed.
- Fixed widths of nested instances (Admin Header selects) cannot be overridden. Compose a local component in a slot instead.
- Verify with a 2x REST render (`figma-comments.mjs image … 2`). Sample pixels when the colours are close. Jacob caught a "fixed" Date Picker that read wrong at 1x.
- Before removing a variant, move its users off it with getInstancesAsync.

## 6. High-waters (tools/<file>/high-water.txt)

| File | High-water |
|---|---|
| Library | 2026-10-19T18:51:44.964Z (loop; 1972306358 is still unanswered) |
| People | 2026-10-19T18:47:43.815Z |
| Admin | 2026-10-16T21:51:39.611Z |
| Auth | 2026-10-16T19:34:09.057Z |
| Media | 2026-10-16T20:26:03.506Z |
| Orders | 2026-10-16T19:39:30.678Z |
| Payments | 2026-10-16T20:25:19.185Z |
| Pricing | 2026-10-14T21:56:04.754Z |

## 7. Evening 2026-10-19

Detail and comment ids: per-file logs. Snapshots: tools/<file>/snapshots/*-2026-10-19.json.

### 7.1 Changes since the morning

**Library**
- Table Actions 1186:1440: Import, Export, Delete (only Delete on). Assign, Convert, New removed. Header Actions slot takes any component.
- Table Footer 1172:298: Wide 1172:255 (range left, pagination right), Narrow 1172:279 (centred pagination). No stacked layout.
- Inset dividers: Table Row 56:33 (all variants) and Column heads in Table 1101:444. Mobile dividers wrapped in "Divider inset" frames (spacing/md).
- Drawer 127:32: Panel is surface/card in all sizes.
- Date Picker 1208:898, final form:
  - Segment has the field's fill and a text/default icon.
  - Divider before the field, no chevron, value left-aligned. Control and Field FILL.
  - In range uses surface/highest. Tokens primary/soft and brand/soft are deleted.
- Admin Header 730:8 and Mobile 734:269:
  - Count always reads "N matching".
  - Subtitle property is Totals, with an annotation.
  - Mobile has Divider 1223:5552.
- The Table description and the Tables in use 1179:9297 rows are updated.

**People**
- Leads actions 506:3566 is in the Leads table slot. Leads filters 503:3422 (mobile) is in the Admin Header / Mobile filter slot.
- Mobile list headers are Library Admin Header / Mobile (511:3528, 511:10716, 511:11339, 511:12159). Breadcrumbs show the route only.
- On the Library Table (Desktop layout, body rows swapped):
  - Customer Orders 195:6190, with Customer Orders Actions 526:12225.
  - Employee Orders 421:6605, with toolbar 515:11690.
  - Timeline 198:6526.
- Value 404:5011: chips, then Performance Stats, then the chart.
- Drawers replace the drilldowns:
  - Assigned Leads 519:13082 and Top Customers 519:13547 ("Dana's …"), with the Table title row hidden.
  - Screens 424:7296 and 424:7991 are deleted.
- Customer-screen triggers are ghost buttons and annotated:
  - Adjust Credit · Drawer 513:7222, Mode Adjust or Set balance.
  - Edit Details 513:12003 and Add Address 513:7405.

**Orders**
- Section "Orders card" 1271:27334:
  - Order Row 1271:27335, Orders Card Actions 1271:27510.
  - Orders card 1271:29638 (Desktop and Mobile, each Default, Empty and Loading).
  - Create Purchase Order 1273:18930 and Create Sale Order 1273:19053 drawers.
  - Their rework (1972388843) goes to the next worker.
- Create Fulfillment · Drawer 1270:27868, per method, LG or Full.
- Form dialogs offered for conversion:
  - Match settlement lines, Adopt refiner assay, Address change, Payout override.
  - Step-up stays a dialog.

**Locations** (fPmV8BtXMi3XboyKNKUGP9, ninth file)
- Address Row 4:15, Customer Addresses 4:638, Address Card 7:197, Add Address Form 5:435 and Drawer 5:639.

**Auth**
- Sign up 9:217 has the "SMS consent" row 167:1884 (unchecked, copy from AuthForm.tsx).

### 7.2 Publishes Jacob owes
- **Library:** brings all the Library changes to the other files and removes the stacked mobile footers. Then:
  - Re-label Orders 1207:15065 and 1207:15238 from orders-table-heads-pre-publish-2026-10-16.json.
  - Set "Created" on the Date Picker Label in Leads filters.
- **Locations:** repoint People to it. Then delete the People originals (172:5875, 379:4923, 513:7357, 513:7405) and Library Address Card 163:32, with a snapshot first.
- **Orders, as a library:** swap the People Orders cards to Orders card 1271:29638.

### 7.3 Open threads
- Library 1972296179: "Maybe just same color as the rest of the trigger." Done; no reply yet.
- Locations 1972356487: "let me know when you're ready to publish." Answered "ready".
- People 1972355662: "Let me know when you're ready to publish there." Answered.
- People 1972375475: "Lets have all of those living in their own frame in the orders page please." Waits on the Orders publish.
- Orders 1972362746: "drawers, not dialogs." Waits on his pick from the dialog list.
- Orders 1972388843: Create Order drawer, for the next worker.
- Earlier: People 1970296424, Upload removal, four superseded sets, Chart y-axis, Jacob's sketch, Orders 1235:25741.

### 7.4 Calls to confirm
- The form drawers use Drawer SM, as the existing People drawers do, not LG.
- Credit 1972368937 is read as a Set balance mode.

### 7.5 Lessons
- **Stale colours:**
  - Re-set paints by id path; findAll misses unmaterialised vectors.
  - Reset fills that a swap carries over.
- **Clones and swaps:**
  - clone() drops property links.
  - swapComponent keeps overrides and changes nested ids, so re-query after each swap.
  - Children hidden by a boolean are not listed until the switch is on.
- **Jacob works live** and reverts within minutes:
  - Re-read the comments before each reply.
  - Never move a high-water backwards; the loop advances it.
- **Fresh render before every reply:** `figma-comments.mjs image <fileKey> <id> <out> 2`. Sample pixels when colours are close.
- **Shared components:** check getInstancesAsync first. Hiding Customer Header button 1 also hid Edit on the employee headers.

### 7.6 High-waters
| File | High-water |
|---|---|
| Library | 2026-10-19T19:54:16.845Z |
| People | 2026-10-19T19:53:34.311Z |
| Orders | 2026-10-19T19:58:19.817Z |
| Locations | 2026-10-19T19:55:59.581Z |
| Auth | 2026-10-19T19:56:52.846Z |
| Admin | 2026-10-16T21:51:39.611Z |
| Media | 2026-10-16T20:26:03.506Z |
| Payments | 2026-10-16T20:25:19.185Z |
| Pricing | 2026-10-14T21:56:04.754Z |

## 8. Late evening (handoff)

Detail per item: orders-, people-, library-, locations-comments-log.md (sections dated 2026-10-19 evening). Snapshots: tools/<file>/snapshots/*-2026-10-19.json.

### 8.1 Changes since section 7

**Orders: Create Order Drawer** (section Orders card 1271:27334)
- Five frames:
  - Shared 1293:25223: Create Order Steps 1279:19679 (four steps) and Decide Later Tile 1293:25224.
  - Order 1293:25213: drawer 1293:25214, body 1293:25215, Lot Row 1280:20108, Lot Select Table 1284:31621 and its row and toolbar.
  - Fulfillment 1293:25216: drawer 1293:25217, body 1293:25218, Method Tile 1282:20334.
  - Money 1293:25219: drawer 1293:25220, body 1293:25221, Pricing Summary 1283:20052.
  - Review 1293:25222: drawer 1287:38151, body 1287:33216, with Loading and Error.
- Four steps (Jacob 1972428438). Step 1 Order holds the Kind, Party and Lots sections. Kind is four Radio Cards: Customer Purchase, Customer Sale, Refiner Purchase, Refiner Sale. No New customer button.
- Decide later: no-lots orders may defer Fulfillment and Money.
- Explanatory copy is in annotations, not on the canvas (59 notes).
- Lot Row: the duplicate icon is copy-plus, with tooltip "Duplicate lot".
- Un-clipped: every screen shows full height. Each body has one annotation: "Header and footer sticky; body scrolls". The Scrolled variants are deleted.
- Premium is percent of spot ("Premium (% of spot)"):
  - Scrap 75, bullion 98, customer sale 103.5.
  - Estimates: scrap $408.97, bullion $23,645.44.
  - Order estimate: purchase $24,054.41, sale $24,972.48.
  - Pricing Summary purchase: Fine gold 10.226 t oz, Metal value $24,673.29, Payout total $24,054.41.
- Lot Select Table Default is an instance of the refiner Lots table (desktop Lots / Refiner 338:10143, Selection=Some; mobile 1235:25741).
  - Every column, including the source customer Order.
  - Add, Combine and Remove are hidden.
  - Empty keeps the Library empty state.
- The old Create Purchase and Create Sale drawers and forms are deleted.

**People**
- Rule: drawers open no drawer and no dialog. Drawer Inline Add 547:10803 (Subject x Layout), plus State=Adding:
  - Lists 547:10804, 547:11719, 547:12118, 547:12904.
  - Drawers 547:10986, 547:11838, 547:12306, 547:13041.
- Drawer List Toolbar 543:9009 (Customers, Leads, Orders):
  - Icon buttons are 44 px (control/lg).
  - Desktop sorts in the column heads; mobile uses a Sort select.
- Employee drawer lists 518:12624 and 518:12442:
  - Desktop is a selectable Desktop Table with Default, Selected, Empty, Loading and Adding.
  - Mobile has Default, Empty, Loading and Adding.
  - Row double borders are cleared.
- Employee Activity 207:4723 is on the Library Table (Timeline Row). On desktop it replaced the Orders card in Left 78:2732. The mobile Orders card is removed.
- Dana's Orders: drawer 549:13043, list 549:11781 (desktop Table; mobile Orders library Order Row). No Add.
- Employee Performance, Orders (Profitability) tab: View orders (465:10180, 465:10185) opens Dana's Orders.
- Black icon strokes are re-bound to text/muted: drawer search and timeline package.
- Deleted (superseded): 425:5583, 416:6446, 440:9586, 447:6367. People 195:6553 annotation now points to Payments 60:1359.

**Library** (all wait on publish)
- Table 1101:444: axis In card renamed Bordered (True/False).
- Table Header 1172:254: Toolbar divider, shown with Show toolbar.
- Drawer 127:32: Body overflow vertical, not clipped.
- Selection Bar 871:17 (mobile): x upper right, Subtle.
- Marquee and Header Spots: surface/background.
- Address Card page deleted.

### 8.2 Rules learned
- A drawer never opens a drawer or a dialog; adding happens inline in the drawer body.
- Sticky header and footer go in an annotation; Figma shows the full screen.
- Premium is percent of spot, as in the Pricing Rates table.
- The drawer lots table mirrors the refiner order lots table, all columns.
- combineAsVariants on variants taken from another set strips the property names ("=1 Order, …"). Check the names after every split.

### 8.3 Queue, in order
1. People 1972415714: Customers list on the Library Table. Admin Header filter slot; actions Assign to employee, Delete, Export.
2. People 1972415943: Employees KPI proposal frame, marked PROPOSAL.
3. Locations 1972391267: Map component, pinned NEW.
4. Section 7.3 open threads.

### 8.4 Waiting on Jacob
- Mobile row selection in the employee drawers.
- Mobile selection on the refiner Lots card.
- Keep the refiner Money "Settlement comes later" alert?

### 8.5 Publishes owed
- **Library:** everything in 8.1 Library, plus the section 7.2 items.
- **Orders:** Create Order drawer and parts, for the code lane.
- **People:** no publish owed.

### 8.6 Threads replied this evening, still unresolved (do not answer twice)
- Orders 1972388843: Create Order thread. Answered.
- People 1972454569 (orders drawer), 1972446135 (toolbar divider).
- NEW pins (bot roots): People 1972441789 (toolbar), 1972461442 (Dana's Orders); Library 1972435063 (Selection Bar).
- All other threads replied this evening are resolved.

## 9. Night (third worker)

Detail per item: orders-, people-, locations-, library-comments-log.md, sections "2026-10-19 late (third worker)".

### 9.1 Done
- Orders, Create Order: Fulfillment is type first, then details (Type axis plus Carrier pickup / Own label states). Transaction (renamed from Money) is Method then Accounts, with no Details block; the Send Link block covers no linked account. Review is attempt 3 and mirrors the order screen: stats, read-only Lots, Fulfillment and Payment Summary cards. Order step has the states Kind locked, Employee viewer, No lots and Conflict, and the Kind Refiner purchase. Sample numbers: $24,066.04, 10.232 t oz, $24,688.80.
- Orders, order screen sets gained states: Lots Row Editable, Lots and Lots / Refiner Read-only, Fulfillment and Payment Summary.
- People:
  - Employee drawer tables match mobile.
  - The lead Estimate is on the Library Table, with Estimate Actions.
  - Add Item and Edit Contact are now drawers.
  - Customers list is on the Library Table, with Customers actions and filters.
  - PROPOSAL Employee KPIs frame added.
  - Ruling 162 archive states drawn.
- Locations: Map component (18:371), placed in the Add Address form.
- Library: Message Content=Image (ruling 161).

### 9.2 Rules learned
- A text set through a drawer's nested path becomes an override that shadows later body edits.
- clone() of a component drops instance names set after creation, and resetOverrides() clears them too. Find by main, not by name.
- Hidden nested instance children are not addressable. Use resetOverrides and re-apply.

### 9.3 Waiting on Jacob
- People 1972415943: confirm Employees (the pin sits on empty Users canvas).
- Library publish: Message image bubbles. Then add one inbound and one outbound sample in the lead thread (People 34:2496 Customer messages).
- Orders publish, for the code lane.

## 10. Pause (2026-10-20)

Fourth worker. Detail: people-, library-, orders-comments-log.md, "night (fourth worker)".
### 10.1 Landed since section 9
- **People, Leads port gaps** (snapshot leads-page-pre-new-lead-assign-2026-10-19.json).
  - New lead drawer, frame 571:4150: New Lead Form 571:4396 and New Lead · Drawer 571:5146. Pin 1972578115.
  - Assign picker, frame 572:4710: Assignee Row 572:4721, Assign Picker 572:4820, Assign Leads · Drawer 572:21813. Pin 1972578122.
  - Location field: Contact info 573:5036 / 573:5049 and Edit Contact Form 573:5060. Pin 1972578932.
  - Documents card 216:5285 unchanged. Reply 1972579070 on 1972288177.
- **Library** (snapshot focus-drawer-pre-2026-10-19.json).
  - State=Focus (Focus ring layer, focus/ring, stroke/heavy, 2 px offset) on: Button, Icon Button, Checkbox, Radio, Radio Tile, Radio Chip, Radio Card, Switch, Chip, Tab, Multiselect.
  - Ring added to the existing Focus variants of Input, Select and Textarea.
  - Contrast PROPOSAL frame 1269:2 on Foundations. No variable changed.
  - Drawer Size=Full: close button 1058:33 shown, bound to Show close.
  - Empty State 127:49: Icon property wired to the glyph.
  - Pins 1972584602/612/617/622. Summary 1972584681 on READ ME 979:3, reply 1972585665.
- **Orders.**
  - Lot Row 1280:20108: all 8 variants on surface/card, radius/base, border/default hairline. Reply 1972784726.
  - Review header: Stats replaced by a Library Card with Content = Review Header 1337:42997 (Kind x Layout), in all 10 body variants of 1287:33216. Review drawers 1287:38151 grown. Reply 1972794685.
  - Send Link 1319:36307 (Transaction Accounts block), both states: surface/card, radius/base. Reply 1972795499.
  - **Footer work: NOT started.** No Orders or Library node was changed for it.

### 10.2 Threads
- Answered: People 1972288177 (reply 1972579070). Orders 1972781861, 1972784712, 1972785113.
- Unanswered (Orders): 1972785617 "Cancel far left" (+1972785790 "tertiary").
  - 1972785727 "skip button next to continue, secondary", with Jacob's replies 1972786092, 1972786692 and 1972786834.
  - 1972786247 "Errors above the buttons in the footer".

### 10.3 Waits on Jacob
- **Publishes:**
  - Library: focus states, Drawer Full close, Empty State icon wiring, plus the earlier items in 8.5.
  - Orders: the Create Order changes, for the code lane.
- **People:**
  - Keep the lead Location, or drop the header city line?
  - Documents card: four fixed kinds, or uploaded PDFs?
- **Library:**
  - Approve the focus ring look.
  - Pick a contrast candidate per row in 1269:2.
- **Skip rule** (given by Jacob in 1972786692/834; needs only the drawing): Order step enabled once Kind and Party are set, Disabled before; enabled on Fulfillment and Transaction; absent on Review.

### 10.4 Exact next step (footer, Orders 1972785617 / 1972785727 / 1972786247)
1. **The problem.** The Create Order drawers (Order 1293:25214, Fulfillment 1293:25217, Transaction 1293:25220, Review 1287:38151; 78 variants) use the remote Library Drawer. Its Footer (SM 127:15, MD 1056:2570, LG 1056:2581, Full 1058:36) holds two fixed Buttons, and an instance cannot take new children.
2. **Library Drawer change.** Snapshot first. In each Footer:
   - Add a "Footer content" INSTANCE_SWAP slot (default: a placeholder Slot like 818:2), FILL width, visible through a new BOOLEAN "Custom footer" (default false).
   - Bind both Buttons' visible to a new BOOLEAN "Show buttons" (default true).
   - Existing instances stay unchanged. Pin NEW and ask Jacob to publish.
3. **Orders: build the local set "Create Order Footer"** in Shared 1293:25223, with Step x Layout x State:
   - Desktop: Cancel Tertiary at the far left (SPACE_BETWEEN). At the right: Back (not on Order), Skip Secondary, then Continue Primary ("Create order" on Review).
   - Mobile: stacked FILL buttons in this order: Continue, Skip, Back, Cancel (Tertiary).
   - States:
     - Order: Default, Skip disabled (party empty; Continue Disabled too), Continue disabled (Conflict), Error.
     - Fulfillment: Default, Error.
     - Transaction: Default, Continue disabled (No accounts), Error.
     - Review: Default, Loading (all Disabled, "Creating…"), Error. Review has no Skip.
   - Error variants: a Danger Alert row (FILL) above the buttons. Move the Review Error alert text there.
   - The Refiner conflict alert stays inline on the Order step.
4. **After the Library publish.** In every drawer variant, set Custom footer=true, Show buttons=false and Footer content = the matching footer variant. Remove the alert from the Review Error body. Grow the drawers so they are not clipped.
5. Render one desktop and one mobile footer at 2x. Post one reply on 1972785617 that covers all three threads and states the Skip rule. Reply on 1972786247. Log it.

Jacob, at the pause (ruling 164): the Drawer footer is a generic buttons
slot, not a named Skip slot. The Create Order footer (Cancel tertiary at the
far left; Back, Skip, Continue at the right; the error row above) is placed
into that slot by the Orders file, so the footer work does not wait on a
Library property, only on the publish if the slot itself is new.

## 11. Afternoon 2026-10-20

Fifth worker. Detail per item: orders-, people-, library-, locations-, icons-comments-log.md, sections "2026-10-20".

### 11.1 Done
- **Create Order footer.** Set Create Order Footer 1342:43231 in Shared 1293:25223: Step x Layout x State, plus Show error.
  - Cancel Tertiary on the left. Back, Skip (Secondary) and Continue on the right. Create order on Review.
  - The error row is an absolute Danger Alert above the footer edge, so it changes no layout.
  - Placed into the published Drawer footer slot on all 78 screens (1293:25214, 1293:25217, 1293:25220, 1287:38151).
  - Order Conflict uses Skip disabled. No accounts and Link sent use Continue disabled.
  - The Review Error body alerts are removed. Each drawer Footer has clip off.
- **Review header.** Review Header 1337:42997: Assigned to is on its own line under the name. The 10 Header card borders are cleared.
- **Library Drawer 127:32.**
  - Footer slot: Custom footer, Show buttons, Footer content.
  - New properties: Dismissible, Show grabber, Confirm close.
  - BEHAVIOUR notes (ruling 167).
  - Full variant: Grabber (a vertical bar on the left edge, vertically centred, 44 px hit area; drag it toward the right edge to close, per 1974129368), plus a Safe area inset bound to the new token spacing/safe-area-bottom (34).
- **Library Slot 818:2.** No fill; the dashed outline stays.
- **Library Add Item.** New page 1286:5617 holds three sets:
  - Add Item Form 1286:5950: Scrap or Bullion, Premium, Upload images.
  - Add Item Footer 1286:6028.
  - Add Item · Drawer 1286:7201: Default, Saving, Error.
  - It will open from the People lead Add Item and the Orders Lots card + button (170:2260 and 170:2421 are annotated). The Create Order Lot Row stays inline.
- **Other Library changes.**
  - Upload Drop target is FILL.
  - Icon Button has Intent=Success: 36 variants. Table Actions Export uses it.
  - Message Image time text is bound to the Time property.
- **People.**
  - Add Item Form 559:19505: the Attach button is now a Library Upload 578:21776 with the label "Upload images" 584:5163.
  - Assign uses clipboard-list on 17 buttons.
  - Location is split into City and State (588:5203). Contact Info and Lead Header have a No location state.
  - Image bubbles are in the lead thread 34:2541.
  - The Leads filters Date Picker label reads "Created".
- **Orders.** Activity 1207:15065 and Refunds 1207:15238 have their head labels back.
- **Locations.** Map 18:371 is a placeholder reading "Google Maps".
- **Pricing.** Remove range is Danger.
- **Icons file qxJf2XlhEFwy4uGHaH0L0n.**
  - Page 36:2, table "Action icons" 39:28: Head row and 41 rows.
  - Synonyms share one row with a slash (Delete / Remove, Export / Download, Send / Resend).
  - Trend up and Trend down are separate rows.
  - Root comment 1974101121.

### 11.2 Contrast (Library 1972584612)
- **Applied** on Jacob's word (1974128235), in Color (Dark):
  - text/placeholder #888b95
  - text/danger #ed576a (its own value now, not an alias)
  - status/destructive-foreground #0d0e11
- Borders and inputs are unchanged (decorative).
- 1269:2 and the preview 1299:7356 are both marked APPLIED.
- Other files get the change on the next publish.

### 11.3 Waits on Jacob's next Library publish
- **Icon Button Intent=Success.** Then set it on People 506:3523, 506:3543, 563:4054, 564:8176, 564:8181 and Orders 1271:27480, 1271:27496.
- **Add Item · Drawer.** Then replace People 559:19655 with instances, and wire the Orders Lots + button.
- **Small fixes:** the contrast variables, Upload FILL, Drawer footer clip, Grabber, Safe area, Dismissible, Message time binding, Slot without fill.

### 11.4 Open
- **People 1974097388 (customers page ideas).** Ideas are listed. Waiting for Jacob to say which to draw.
- **Known defect:** the Lot Row mobile Loading skeleton bar overflows the card edge. Not fixed.
- **People employee drawer Icon Buttons.** They keep an explicit 44 px height, because Size=LG is 40.
- **No thread is unanswered** of those relayed to this worker.

### 11.5 Exact next step
Wait for the relays. After the next publish, clear the list in 11.3, render each change fresh at 2x, and reply on the threads named in the logs.

## 12. Evening 2026-10-20

Sixth worker. Detail per item: orders-, people-, library-, inventory-, fulfillment-, icons-, payments-comments-log.md, "2026-10-20 (sixth worker)".

### 12.1 Rules learned
- **169:** components never have a parent frame or section; each set sits on its page root; one Figma component per code component; states are variants, never sibling components; only screens are frames. Desktop/Mobile pairs merge with a Layout axis.
- **164:** the Drawer footer is a slot. The Create Order footer and the Add Lot estimate sit in it.
- **Cross-file move:** the plugin cannot copy nodes between files. Import the published set, then createInstance, detachInstance and createComponentFromNode, then combineAsVariants, then re-add properties by name and re-bind them by index path, then swap nested instances. An UNPUBLISHED set fails to import, and a CHANGED set imports stale.
- **Publish block:** a property bound to no layer makes the file unpublishable ("Invalid assets ... Unused properties"). Scan every set before handing over. Behaviour-only flags go in the description.
- **Drift check:** render at a past version with REST /images?version=. The helper is scratch fv.mjs; it loads the token like figma-comments.mjs and never prints it.

### 12.2 Done
- **Orders page split:**
  - Create Order Drawer page 1367:70802 holds, at the root: Create Order Drawer 1371:53635 and Create Order Body 1371:53636 (78 variants each; Step x Kind x Type(None/..) x Method(None/..) x Layout x State), Method Tile 1371:53637 (Kind Fulfillment/Payout/Any x Method x Selected x State; 376 instances), Steps, Footer, Review Header, Send Link, Pricing Summary, Lot Row, Lot Select Table/Toolbar/Row.
  - Admin (Components) 1367:70795 holds 66 components. 16 pairs are merged: 1371:53638..53653 (Spots, Lots, Lots / Adding Lot, Lots / Refiner, Payment, Totals, Fulfillment, Create Fulfillment, Shipment, Return Shipment, Pickup, Appointment, Drop-off, Linked Fulfillment, Settlement · proposed, Profit Breakdown · proposed).
  - Left separate (their non-variant props or axes differ): Lots Row, Charges, Activity, Order Card · proposed.
  - Refiner screens are on Admin - Refiner. Nodes went 50917 -> 50878 (only wrappers, sections and emptied sets); COMPONENT stays 641.
- **Filter bars:** Filter Bar (proposal A) and Filter Bar · proposed are deleted. The chips became Order Status Chips 1369:53747, placed under the header (1370:199, 1370:389). They are clipped in the fixed 320 Admin Header filter slot.
- **Orders drift fixes:**
  - Selection bars 620:5758, 620:6163, 635:13849, 673:20394 have the card look back (overrides).
  - New order Primary button on 5 Orders list headers.
  - Mobile breadcrumb on 917:13005.
- **Library:**
  - Drawer: Dismissible and Confirm close deleted (they were unbound and blocked the publish).
  - Grabber 1302:328 is a plain 3 px bar on the 1 px border at x -21.5, 44 hit area, pill 1311:2 removed.
  - Table Header toolbar divider deleted.
  - Focus ring fix: Input, Select and Textarea wrap Box in a "Field" frame (all 54 variants) and the ring hugs the box.
  - Paperwork Row Download 548:13 is Tertiary.
  - Not yet published: the focus ring and Download fixes.
- **Inventory (ZgJF9JWNY6BwxmWABRZ6I7), all components at page root:**
  - Add Lot Form 143:8719, Add Lot Footer 143:8993 (read-only Estimate on the left, TEXT prop Estimate), Add Lot · Drawer 143:11069, Lot Images 143:13136.
  - Lot Row 149:4575, Lots Row 149:5566, Lots 149:9503, Lot Select Row 149:10987, Lot Select Toolbar 149:11069, Lot Select Table 149:13289.
- **Fulfillment (ZpDvIz5JbIgIkZXbGYWfwY), page Components:** Method Tile 8:703, Shipment 8:3346, Return Shipment 8:4750, Pickup 8:5807, Appointment 8:6632, Drop-off 8:7443, Create Fulfillment 8:12005, Create Fulfillment · Drawer 8:17650, Fulfillment 8:20289, Linked Fulfillment 8:20954, Void label · confirm 8:21202.
- **People:**
  - Customer Header 172:5920 is reverted to Assigned to + Ban. The Archived variant, the actions menu and Customer State Archived are removed; the registry rows are reverted.
  - Edit Contact Form is set 599:18265 (Layout; mobile City+State on one row).
  - Timeline 198:6526 is an accordion (Open axis: 604:21734, 604:21921).
  - Customers list: Customer Tile 603:21158 and Top Customers Tile 603:21207 (draft for Top 10). Customer Tiles 603:21354 = Unassigned Customers 612:22414 (row 612:22167, based on Activity Item 6:37) + the Missing SMS consent tile.
- **Orders card 1271:29638** is an accordion (Open axis; 1363:44504, 1363:45643). The People customer Delete-hidden override must be redone after the publish.

### 12.3 Waits on Jacob
- **Publishes:** first publish of Inventory and Fulfillment; then re-point the Orders and People instances and delete the Orders originals (snapshot first). Library publish (focus ring, Download, Drawer cleanups). Orders publish (accordion card, merges, New order).
- **Decisions:**
  - Lot Images 143:13136 vs the older Lot Photos 1:3940.
  - Order Status Chips: a full-width second filter row in the Admin Header, or replace the Show select.
  - Ban stays? (asked on 1974097388).
  - Input cell type in the Library Table Row before swapping the order Lots table (1974245513).
  - Library Selection Bar: card or viewport bar.
- **Method Tile split:** the Orders merged Method Tile 1371:53637 has its Fulfillment variants in the Fulfillment file; after the publish, split Payout back out or re-point.

### 12.4 Open threads
- None unanswered among those relayed. Pending Jacob replies: 1974185750 (KPI order), 1974245513 (table), 1974232661 (bar).

### 12.5 Exact next step
1. Customer KPI cards, one at a time on 1974185750: Not yet contacted, New customers (new vs returning), Average orders + profit (period select), Customers by source + conversion.
2. Then Top 10 by settled value, then Activity, then the Map last.
3. After the Inventory and Fulfillment publish: re-point the instances, snapshot, delete the Orders originals, and move the remaining People components to page root (ruling 169).

## 13. Night 2026-10-20

Seventh worker. Detail: every <file>-comments-log.md, "2026-10-20 (seventh worker)".
- **Ruling 170:** the field focus ring is gone from Input, Select, Multiselect and Textarea. Select and Multiselect Focus now use the primary border. Waits on the Library publish (comment 1974308929).
- **Ruling 171 in all ten feature files:** pages are the navigation.
  - "──── Screens ────", then the screen pages.
  - Then one "──── Components (<screen group>) ────" divider per screen group, with that group's component pages under it. A file with no screens (Locations, Fulfillment) has one Components divider.
  - Page names and set names never repeat the group's name. The old-to-new set renames are in tools/<file>/snapshots/ruling171-set-renames-2026-10-20.txt and in each file's page-map comment.
  - Every page is tidied from the origin (rows, 200 px gap, wrap at 8000; TEXT within 400 px stays with its node). The scratch tidy script is not kept, so re-derive it from the logs.
  - Sections and wrapper frames are deleted. Lists are in tools/<file>/snapshots/ruling171-wrappers-to-delete-2026-10-20.json. Full REST trees from before the change are beside them.
- **Not done:** merging the Desktop/Mobile twin sets into one set with a Layout axis (ruling 169). They are named "Mobile row", "Mobile card" and so on for now. Orders "Photos / Lot photos" kept its name.

## 14. Pause (2026-10-20 evening)

Seventh worker, paused on Jacob's word. Detail: each <file>-comments-log.md, "2026-10-20 (seventh worker)".

### 14.1 Lot screens rebuild (Inventory)
- Section 1:2779 "CURRENT · Lot screens" was lost on 2026-10-09, between version 2408194016944016515 (03:40Z, present) and 2408221582579581614 (04:28Z, absent). Today's work did not cause it.
- The source is saved at tools/inventory/snapshots/lot-screens-1-2779-2408194016944016515.json.
- 20 of 24 screens and all 24 labels are rebuilt on Lots 0:1, below the list screen. They are built from live components, with every override re-applied, and carry new ids (158:501, 159:941..159:4002, 160:4057..160:8217). Root comment 1974407767.
- Not rebuilt: "Lock ounces open" desktop and mobile, because component 1:808/1:838 is gone and the dialog must be built as frames from the snapshot; and "Lot 2493-A — Refiner lot" desktop and mobile.
- The builder scripts are in scratch, so regenerate them from the snapshot: instance by lid or key, apply cp/sk, then nested overrides by "I<id>;<suffix>".
- Live-Library differences: the Header now has the ticker, and the Entity Header shows its own breadcrumb and a second actions row.

### 14.2 Ruling 171 / 172 state
- Ruling 171 dividers (one Components divider per screen group), set renames and tidy are done in all 10 files.
- Ruling 172 feature pages are done in People, Orders and Pricing.
- Still to do: Inventory, Media and Fulfillment. Then run the 172 check on Admin, Auth, Payments and Locations; they are probably already feature pages, so only confirm.
- Twin merges (Layout variant) are done in People, Orders and Pricing. Inventory twins are not merged yet: Header/Mobile header, Refiner/Mobile refiner, Lineage Card/Mobile card, Rows Row/Mobile card, Table Row/Mobile card, Movement row/Mobile movement card.
- Rule: every table feature keeps a Row set with Desktop and Mobile variants. People Leads and Customers Rows are restored (635:6774, 635:7125). Check the other files' table Rows before any stale-set deletion.
- Stale check per file: People is done (deleted the Leads List, two Head rows and two desktop rows; the two desktop rows were then restored from the Library rows). Orders candidates, not deleted: Filter rail 619:4639 and Lot select mobile row 1284:19906.

### 14.3 Waits on Jacob
- Publishes:
  - Library: focus rings (ruling 170), image bubbles, Paperwork Row text buttons, Drawer cleanups, Download.
  - Orders.
  - Inventory and Fulfillment (first publish).
  - People and Pricing, for the merged Layout sets.
- People:
  - Users Table 206:7207 has no instances; keep it or delete it?
  - Five orphan Mobile header/filters sets (200:6550, 203:6725, 202:3680, 203:4039, 202:4256).
  - Ban: keep or remove?
  - Customer KPI cards one at a time (thread 1974185750), then Top 10, Activity, and the Map last.
- Inventory: Lot Images 143:13136 vs Lot Photos 1:3940.
- Orders: Status chips placement (second Admin Header row or replacing the Show select).
- Earlier: the Library Table input cell (1974245513) and the Selection Bar card-or-bar choice (1974232661).

### 14.4 Threads
- No relayed thread is unanswered.
- Pending Jacob replies: 1974185750, 1974245513, 1974232661, and this evening's page-map replies in each file.

### 14.5 Exact next step
1. Inventory: rebuild the 4 missing lot screens. Lock ounces becomes frames from the snapshot. Refiner lot needs the Details overrides (4) and Worth overrides (12) from the snapshot.
2. Inventory ruling 172: Rows/Table/Select become Lots table (Row with Desktop+Mobile, Head, Toolbar), Lot select, and so on. Then the twin merges, tidy, reply on 1974368387, and log.
3. Media and Fulfillment ruling 172, then the Admin, Auth, Payments and Locations check, each with a reply and a log entry.
