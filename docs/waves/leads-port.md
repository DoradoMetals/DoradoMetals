# Leads port

Jacob, 2026-10-19: *"go take a look at the leads/leads entity screens and
components ... If you can't find anything blocking ... lets go ahead and
start porting it. Users/employees/inbox can wait."* Then: *"let the agent
complete the asks on the leads page before we port it however."*

The People file is `5cEytffOkxIfqdRWFaTWpl`. Main screens are
`34:2477` (Admin / Leads) and `34:2661` (Mobile · Leads); the entity screens
are `34:2496` (Admin / Lead) and `34:2702` (Mobile · Lead). Components sit in
the sections Leads list `460:6988`, Lead header `460:6989`, Details
`460:6990`, Estimate `460:6991`, Timeline `460:6992`, Leads · Filters
`502:10120` and Leads · Actions `506:3567`. The design is the source of truth
(ruling 154); the frontend computes no money.

## Starts when

1. The Figma worker has finished Jacob's asks of 2026-10-19 on the lead
   entity (Estimate on the Library Table with Attach images, Add to estimate,
   View images, Delete; Add item as a drawer; the two "convert to drawer"
   pins) and the rulings 161 and 162 states, and Jacob has accepted them.
2. The roles lane is merged (migrations 296 to 298 on dev, Jacob's go).
   Assignment reads and the Assigned to filter depend on it.

## What the screens need

**Leads list.** Admin Header (title, People chips, the immutable totals line
"N leads · M unowned · median Xh to first contact", search by name, phone or
email, New lead) and the filter row (Source select, Assigned to select, Status
chips All / New / Contacted / Converted / Archived with counts, Created date
picker, Reset, "N matching"). The Library Table "All leads": selection,
actions Export, Assign, Convert, Delete, Restore (Restore only on an archived
selection), columns Name (sortable), Source, Status badge, Assigned to,
Estimated value (sortable), Created (sortable, default desc), footer "Showing
N of M" with pagination; the mobile row is a children slot. Four stat tiles:
Response rate by channel (text, call, email), Conversion rate with a
sparkline and a target, Median time to first contact against the target,
Needs attention (unassigned, not contacted). An Activity feed of lead events.

**Lead entity.** Entity header: LEAD badge with the stage (or Archived), name,
number (LEAD-4471), city, created date, breadcrumb, Assigned to select,
Convert, Delete (or Restore). Cards: Estimate (Library Table of items with
the actions above and an Add item drawer; totals weight and estimated value
from pricing), Details (Source select, notes and preferences), Timeline,
Customer messages (SMS thread with text and image bubbles both ways, a
paperclip and a call button), Contact info (phone, email, contact
preference, last contacted, SMS consent), Documents (PDFs with send and
download; a not-yet-available state). Convert Dialog and Delete Lead Dialog.

## API work

All under `api/src/domains/crm` unless named; contracts composed from
generated rows in `packages/contracts`; a repo is five verbs over one table;
pricing prices.

- **Archive (ruling 162).** Migration: `leads.leads.archived_at`. `DELETE
  /api/leads/:id` sets it; `POST /api/leads/:id/restore` clears it; the list
  takes `archived` (default off) and hides archived rows. No statement
  deletes a lead row.
- **Images on estimate items (ruling 137).** `media.images` rows linked to
  `leads.estimate_items`: a link table migration, `GET/POST/DELETE
  /api/leads/:id/estimate/items/:itemId/images`, the count on the item read.
  Uploads go through the existing media path.
- **MMS (ruling 161).** `/api/sms`: outbound `media` on send; the Twilio
  inbound webhook stores `MediaUrl` bodies in `media.images` and links them
  to the message; the thread read carries the image ids. No live Twilio call
  in tests (cassettes).
- **Lookups.** Read endpoints for `leads.sources`, `leads.estimate_kinds`,
  `leads.weight_units`, `leads.contact_preferences` and the purities the Add
  item drawer offers.
- **Summary.** Extend `GET /api/leads/funnel` (or add
  `GET /api/leads/summary`) to return the four tiles and the totals line:
  response rate by channel, conversion rate with a weekly history, median
  time to first contact and the targets from `crm.targets`, needs attention
  counts, unowned count. Built in SQL.
- **Convert.** `carry_estimate` on `LeadConvertBody` (FOLLOWUPS).
- **Assignment.** Reads and writes through `crm/assignments` once the roles
  lane is in; the Assign action takes a list of lead ids and one employee.
- **Guards.** `requireEmployee` with viewer scoping (ruling 155) once roles
  land; `requireAdmin` until then.

## Client and frontend

- `packages/client/src/leads/`: queries and mutations for every endpoint
  above, keys, and nothing else reaches the API (lint:client-boundary).
- `frontend/app/admin/leads/` and `frontend/app/admin/leads/[id]/` per
  docs/waves/frontend-conventions.md: `_components/`, `_api/`, `_lib/`,
  `tests/` beside each; `page.tsx` thin. Copy the structure of
  `frontend/app/admin/orders/`.
- Components come from `@dorado/components` only (Admin Header, Table,
  Stat, Badge, Drawer, Dialog, Chat, Documents, Upload, Photo Viewer). A
  missing Library twin is a finding for the library lane, not a local
  component.

## Tests (ruling 153)

A test agent writes the failing tests first from this spec and the Figma
states: API tests per endpoint (archive hides and restore shows; images link
and count; MMS inbound stores and outbound sends through the cassette;
lookups; summary numbers against seeded rows; convert carries the estimate),
component tests for every screen state (list empty, loading, filtered,
archived, selection with and without archived rows; entity each card's
states), and three Playwright specs (create a lead, add an estimate item with
an image, archive and restore). Then the lane agent makes them pass, then a
reviewer reads the diff.

## Open

- Whether the Send action on a document sends by SMS, email or both; the
  design shows one icon. Default: the lead's contact preference.
- The purities list for the Add item drawer (karats plus Sterling and .999)
  needs a source table or a constant in pricing; decide in the lane.
