# Figma worker handoff (2026-10-16)

Written by the outgoing single Figma worker. Read docs/design/worker-protocol.md first. The loop (tools/all/loop.sh) is run by the coordinator. Do not relaunch it.

## 1. Files, structure, tooling

| File | Key |
|---|---|
| Admin | RAmZ5RfxfW3sE9oM4uuhor |
| People | 5cEytffOkxIfqdRWFaTWpl |
| Library "Themes and Components" | 8A73quhBLBqotJlX95jN9j |
| Media | WkbKhVaAYmxKTsbmAQEwmk |
| Auth | hZ5Ajr9Hn1h2Q2XFRa1NYY |
| Orders | ymmNlCDLVIfanpRQ7QHMIs |
| Pricing | FdBKQiTCRJNS3uJeD1n5zd |
| Payments | GPSOCeWTjc7pDsQBs4gFt4 |
| Inventory | ZgJF9JWNY6BwxmWABRZ6I7 (no work yet, no tools folder) |

Structure built:
- Admin, page "Admin": section Main screens 18:761 holds screen Admin / Overview 18:763 (Content 18:1510: Admin Header 18:2193, grid Cards 21:655 with the leads card instance 22:687). Section Uncontacted Leads 18:762 holds one nested section per part: Uncontacted Leads Header 45:787, Lead Source 41:584, Lead Status 41:585, Lead Age 41:586, Lead Assignee 41:587, Reach Out 41:588, Lead Row 41:589, Uncontacted leads card 41:590.
- People, page Employees: Main screens 453:11915 (screens 75:4353 desktop, 75:4666 mobile), Employee 453:11916, Employee · Lead conversion 453:11917, Employee · Top customers 453:11919, Headers, Lists, Rows, Cards 453:11923, Charts 453:11924, Configuration 453:11925, Performance Stats 456:7723. Users, Leads and Inbox pages are split by feature (sections 460:6975-460:6986, 460:6987-460:6992, 460:7419-460:7420).
- Payments, page Accounts 57:480: Bank Link, Provider Option, Payout Account Row, Payout Accounts, Add Payout Account · Drawer. Screens were deleted on Jacob's word.
- Media: Quote Estimate 225:2270. Auth: Pitch set 143:1655, Auth Form 9:221. Orders: Order header states 1240:25417, 1240:25460.

Tooling: tools/<file>/ (admin, people, library, media, auth, orders, pricing, payments) holds figma-comments.mjs, poll.sh, high-water.txt, snapshots/. Commands: `node figma-comments.mjs json <key>`, `reply <key> <commentId> "<msg>"`, `post <key> <node> x y "<msg>"`, `image <key> <node> <png> <scale>`. Reply goes to the thread root; on HTTP 429 wait and retry. Deletion records and restructure snapshots live in tools/admin/snapshots and tools/people/snapshots.

Fresh-render rule: before any reply, render the changed node with `figma-comments.mjs image` and look at the PNG. Never trust an MCP screenshot as proof.

Logs (append only): docs/design/{admin,people,library,media,auth,orders,payments}-comments-log.md.

## 2. Open items per file

Admin
- 1970309306 (count back, header component): DONE. Header 45:788, reply 1970311085, logged.
- Nothing else open.

Library
- Ruling 157, one unified Table: survey thread 1970307530 pinned on Table 1101:444. Waiting on Jacob's answers before the build. Do not answer it in other threads (Jacob asked for its own thread).

Orders
- 1970300073, Orders card divider: question asked, waiting on Jacob.
- Question pinned on 1235:25741 (Mark returned states): waiting.

People
- 1970296424, Assigned Work question: waiting on Jacob.
- Inline Upload removal question: waiting on Jacob.
- Four superseded People sets (replaced in the restructure, still on canvas): waiting on Jacob's word to delete. Record ids on disk before any delete.
- Apply Narrow y axis on Employee Performance 438:5721 charts (Show y axis off, Narrow on) after the next Library publish.

Payments
- Bank Link / Payout flow: waiting on Jacob's review and the Library publish of the items in section 3. Plaid follow-up is in FOLLOWUPS.

Media, Auth, Pricing
- No open threads. Brand assets (logo files for Auth pitch and Media) are owed by Jacob.

## 3. Queued for the next Library publish (only Jacob publishes)

- Chart / Line 57:60: BOOLEAN "Narrow y axis" (frame 1158:2).
- Admin Header / Mobile: breadcrumb default on.
- Upload Drawer 1138:193.
- Already published: Marquee 1091:19 changes, Chart / Line Series 2 low and plot stretch, Tooltip 32:177 slot props, Icon Button Variant=Subtle 457:75.

## 4. Components made today (ids)

Admin (local)
- Uncontacted Leads Header 45:788 (Default / Loading)
- Lead Source 41:329; Lead Status 41:342; Lead Age 41:352; Lead Assignee 41:374; Reach Out 41:390
- Lead Row 22:325 (Owner Default 22:300, Employee Default 22:314, Owner Loading 37:618, Owner Empty 37:622)
- Uncontacted leads card 22:686 (Owner Desktop 22:326, Employee Desktop 22:522, Owner Mobile 37:632, Employee Mobile 37:641). Rows sit in a fixed 640 viewport, clipsContent, absolute Library Scrollbar; annotation "Scrolls internally" on 22:686 and 22:687.

People
- Employee Performance 438:5721; Performance Stats 456:7724; Performance Chart Tooltip 463:7694; Performance Chart Hover 475:3756
- Employee Orders 421:6605; Auto-assign 453:7669 (variant 453:7574), card instance 453:7670 (400 wide beside the table on 75:4353)
- Employee Configuration 444:6701; Employee Assigned Work 444:7508; Assigned Work Row / Head 473:8075, Row 473:8102, Mobile 473:8103
- Employee Row / Head 72:2051, Employee Row 72:2060 (horizontal: Name 150, Email fill, Phone 130, Role 90, Assigned orders 130, Status 90)
- Customer Value 404:5011 (Metric=All 450:6312 / 450:6535); Value Chart Tooltip 411:6415; Value Chart Hover 475:3717
- Estimate Item Row set 455:3225 (Rest 410:6243, Hover 455:3200; Attach is Icon Button Subtle with paperclip)

Payments
- Bank Link 59:1169 (Purpose x State, no manual entry); Provider Option 70:913; Payout Account Row 60:1182; Payout Accounts 60:1277; Add Payout Account · Drawer 60:1359

## 5. Mistakes and the rules from them

- Stale MCP screenshots: I claimed fixes that were not on canvas. Rule: verify every change with a fresh REST render before replying.
- States as card variants: states (Loading, Empty, Disabled) belong in the smallest component that owns them (ruling 152), not as extra card or screen variants.
- One frame (section) per feature or part; no parent frames that wrap many unrelated sets. Granular parts each get their own nested section.
- Overlaps on canvas after edits: restack sections and check the whole page after any resize.
- Converting GRID to HORIZONTAL gave equal columns and truncated text: set fixed widths per column, one fill column.
- Reparenting text drops property bindings: rebind and reapply overrides after a move.
- Swapping an Icon Button variant resets its glyph to arrow-left: reswap the nested glyph, then scan for stray arrows.
- After resetOverrides the instance name resets: rename.
- Answer in the thread Jacob asks for; a new topic gets a new thread.
- Read the ask literally ("3/4 rows" meant four info rows of one order); ask when unsure.
- Library limits hit: frames inside an instance cannot be resized (table column widths, chart axis width), so the fix is a Library property; openTypeFeatures (tabular digits) cannot be set per instance; y axis width needed the Narrow y axis option.

## 6. High-water values

| File | High-water |
|---|---|
| Admin | 2026-10-16T21:19:27.429Z |
| People | 2026-10-16T21:21:07.928Z |
| Library | 2026-10-16T21:16:24.821Z |
| Media | 2026-10-16T20:26:03.506Z |
| Payments | 2026-10-16T20:25:19.185Z |
| Orders | 2026-10-16T19:39:30.678Z |
| Auth | 2026-10-16T19:34:09.057Z |
| Pricing | 2026-10-14T21:56:04.754Z |
