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
