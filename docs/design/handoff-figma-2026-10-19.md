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
