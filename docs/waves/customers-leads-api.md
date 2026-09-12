# Customers, leads and the inbox: the API (crm2 lane)

Built from `docs/design/customers-leads-screens.md` (drawn on `designs2-lane`,
not yet merged when this lane started - pulled from
`13043857` to work from) and the explicit task list, scoped to `accounts`,
`crm` and their `db/{auth,leads,crm}` folders. `docs/design/statuses.md`'s
CRM section (`lead_stage` derivation) is the other source.

## Migrations (207-209, applied to dev)

- **207 - `a_customer_is_assigned_and_annotated.sql`**: `auth.users` gets
  `assigned_to_id uuid REFERENCES auth.users(id) ON DELETE SET NULL` (indexed)
  and `notes text`. Additive only.
- **208 - `a_lead_is_assigned_and_sourced.sql`**: `leads.leads` gets the same
  `assigned_to_id` shape and a `source text` column. Additive only.
- **209 - `a_message_can_be_marked_read.sql`**: `crm.sms_messages` and
  `crm.calls` get `read_at timestamptz`, backfilled to each row's own
  timestamp (so shipping this does not flag months of history as unread).

None of the three touch `exchange`.

## Routes

| route | notes |
|---|---|
| `GET /api/users` | unchanged URL; `AdminUser` now carries `banned`, `ban_reason`, `ban_expires`, `assigned_to_id`, `notes`, `orders_count`, `open_orders_count`, `last_contact` |
| `GET /api/users/:id` | same enriched `AdminUser` shape as the list |
| `GET /api/users/admins` | same enriched shape (needed so `AdminUser`'s new required fields don't split into two return shapes) |
| `PATCH /api/users/:id` | **new**. `UserPatch`: `assigned_to_id`, `notes`, `banned`, `ban_reason`, `ban_expires`. Banning without `banned: true` needs no reason; banning **with** `banned: true` requires a `ban_reason` of at least 3 characters (`rules.assertBanReasonGiven`) - confirm-class per ruling 112, not override-class: no step-up, just a reason beside the action |
| `GET /api/customers/:id/timeline` | unchanged URL; now also returns `kind: 'order'` (one row per order, `status` is the order's own derived `ORDER_STATE`) and `kind: 'note'` (at most one row - see below) |
| `GET /api/leads` | now takes `?stage=&priority=&assigned_to=&source=&q=`; `assigned_to=unassigned` matches `assigned_to_id IS NULL` |
| `GET /api/leads/:id`, `POST /api/leads`, `PATCH /api/leads/:id`, `DELETE /api/leads/:id` | unchanged URLs; the row now carries `assigned_to_id`, `source`, and the derived `lead_stage` |
| `POST /api/leads/:id/convert` | **new**. Body `LeadConvertBody` (`name`/`phone`/`email`, all optional, falling back to the lead's own values) creates a customer, re-points that phone number's `crm.sms_messages`/`crm.calls` rows at the new user, and sets `converted = true`. One transaction. 422 with no email (from either the lead or the body); 409 if already converted |
| `GET /api/inbox` | **new**. One row per conversation across `crm.sms_messages` and `crm.calls`, newest first, unread first |
| `PATCH /api/inbox/:key/read` | **new**. `:key` is `user:<uuid>` or `phone:<e164>`, exactly the shape `GET /api/inbox` hands back; marks every unread inbound row in that conversation read |

## The customer list's counts, in SQL

`db/users/sql/get_all.sql` (and `get_one.sql`, `get_admins.sql`, kept
identical in shape so `AdminUser`'s new required fields don't split the three
reads into different contracts) compute:

- `orders_count` / `open_orders_count` - a scalar subquery against
  `orders.orders`. "Open" reuses `ORDER_STATE`, imported from
  `#db/orders/repo.ts` exactly the way `db/places/addresses/repo.ts` already
  does (`/*__order_state__*/` substitution) - not duplicated, so a future
  change to the order ladder cannot make this count disagree with the order
  screen.
- `last_contact` - `greatest()` of the latest `crm.sms_messages.created_at`
  and `crm.calls.started_at` for the user.

This is a SQL join across schemas from within `accounts`'s own `db/users`
files, not a reach into the `orders` domain's code - the same distinction the
existing `db/places/addresses` read already relies on. `lint:domain-boundaries`
does not gate `accounts` or `crm` against `orders`, and the read is SELECT-only.

**Decision: `AdminUser.getOne`/`.list`/`.getAdmins` are not runtime-parsed.**
An earlier draft called `AdminUser.parse(row)`, matching the letter of "a repo
parses the view it builds" - and it broke immediately: `auth.users.createdAt`/
`updatedAt` and the new `last_contact` come back from `pg` as `Date` objects
(no timestamp type parser is registered in `pool.ts`, unlike `NUMERIC`/`INT8`),
so a synchronous `z.string()` check sees a `Date`, not the ISO string it will
become once Express's `JSON.stringify` runs. `CustomerTimeline` avoids this by
formatting every timestamp with `to_char(... AT TIME ZONE 'UTC', ...)` before
its own `.parse()`; doing that for every timestamp column on `auth.users` and
`leads.leads` was judged out of scope for this pass, so these three functions
return typed-but-unvalidated rows, exactly as they did before this lane
touched them. `InboxConversation` and the timeline's new `order`/`note` rows
**are** pre-formatted with `to_char` and **are** parsed, because they are new
code with no such debt to inherit.

## Ban state

`auth.users.banned` / `"banReason"` / `"banExpires"` already existed
(better-auth's admin plugin) - no migration needed. `AdminUser` previously
omitted all three; it now re-adds them renamed to `banned`, `ban_reason`,
`ban_expires` (the same rename pattern already used for `email_verified`,
`created_at`, `updated_at`). No derived `state` string: the three facts are
enough for the frontend to show Active/Banned, which is a one-line boolean
flip, not business logic.

## Notes: one column, not a table

`auth.users.notes` is a single free-text field, matching `leads.leads.notes`'
existing shape exactly, rather than a `crm.notes` audit table. Reasoning: leads
already settled on this shape for the same idea, a single overwritable field
keeps the PATCH generic (no separate notes endpoint), and a real append-only
ledger is a bigger change than an admin's running scratchpad warrants right
now. The cost: the timeline shows notes as at most one row, timestamped by
`auth.users."updatedAt"` - imprecise (any facts update touches it, not just a
notes edit) and worth revisiting if notes ever need their own history.

## Lead stage, assigned_to, source

`lead_stage` is derived in SQL (`db/leads/sql/lead_stage.sql`, one `CASE`,
substituted into `get_one.sql`/`get_all.sql`/`create.sql` and into `update()`'s
`RETURNING` the way `order_state.sql` is substituted elsewhere) from the three
existing booleans: `converted` > `responded` > `contacted` > `New`. The
booleans are untouched - this only adds the derived label, per
`docs/design/statuses.md`'s recommendation ("merge into one derived lead_stage
... nothing is deleted, a view is added").

`assigned_to_id` on both `auth.users` and `leads.leads` points at
`auth.users(id)` (an admin), not at `auth.employees(id)`. The design doc
offered both options; `orders.orders.assigned_to_id` and
`refining.orders.assigned_to_id` already exist and both reference
`auth.users(id)`, so this follows the codebase's own precedent rather than
introducing a third shape. `GET /api/users/admins` is the existing endpoint
that resolves the option list.

`leads.leads.contact` (`text DEFAULT 'Jacob Johnson'`) was doing the
assignment job informally in free text before this lane. It is left exactly as
it is - untouched history, no migration, no backfill into `assigned_to_id`.
`source` is a new, unrelated column (where the lead came from); nothing
populates it automatically yet, because nothing outside the admin UI creates a
lead today (`POST /api/leads` is `requireAdmin`-only, confirmed by
`crm/leads/tests/journeys/admin-creates-lead.test.ts`).

## Convert

`crm/leads/service.ts#convert` opens one transaction: reads the lead, asserts
it is not already converted (`Conflict`/409) and that an email exists from the
body or the lead (`Invalid`/422), calls
`accounts/users/service.ts#createFromLead` (checks the email and, if given, the
phone are not already in use - `Conflict`/409 either way), re-points that
phone number's message and call rows at the new user id, then flips
`leads.leads.converted`. The cross-domain write goes through `accounts/users`'
own service function, not a direct insert into `auth.users` from `crm` -
`createFromLead(facts, tx)` takes the transaction's client directly (ruling 56:
only the use case opens a transaction) rather than opening its own.

Phone matching (both the convert-time re-pointing and the inbox's lead lookup,
below) compares the **last 10 digits** of both sides
(`right(regexp_replace(x, '\D', '', 'g'), 10)`), not full E.164 equality -
`leads.leads.phone` is unnormalised free text (seen directly in
`crm/leads/tests` fixtures: `'2145550100'`, no `+1`), while Twilio writes
E.164. This is a best-effort simplification, not a full phone-normalisation
utility (`172_backfill_sign_in_phones_from_the_address_book.sql`'s own
normalisation is the fuller version of this problem, applied once to
`auth.users.phone_number`; `leads.leads.phone` has never been run through it).

## Inbox

`db/crm/inbox/sql/list.sql` unions `crm.sms_messages` and `crm.calls` into one
`messages` CTE (a voicemail is `status = 'voicemail'` on a call row, so it
gets its own `channel` value alongside `sms`/`call`), groups by
`coalesce(user_id::text, phone)`, and resolves a name/kind/`assigned_to_id` by
joining `auth.users` when `user_id` is set or a phone-matched `leads.leads` row
(via a `LATERAL ... LIMIT 1`, so an ambiguous phone match can never fan out
the conversation into two rows) when it is not. Unmatched numbers show as
`kind: 'unknown'` with the raw number as `name: null`.

`read_at` is the fact `PATCH /api/inbox/:key/read` moves: `NULL` on an inbound
row until read, set at insert time for outbound (`crm.sms_messages` and
`crm.calls`' create statements now set `read_at = now()` for an outbound row,
matching the reasoning "Dorado sent it, so it is read by definition"). The
route decomposes `:key` back into `(user_id, phone)`
(`crm/inbox/rules.ts#parseKey`) and calls each table's own new `markRead`
repo function in one transaction - writes stay owned by the table that holds
the column, mirroring how `attachToUser` (convert) is split the same way.

**Scope cut**: the customer list's own filters/search/sort
(`Open orders`/`Credit`/`Assigned to`/`Sort by`, drawn in the screens doc) were
not built - the explicit task list for this lane asked only for the counts,
ban PATCH, timeline and notes on the customer side, and building unrequested
filters risked scope creep on an already large lane. Leads' filters **were**
built because the task explicitly asked for them.

## Gate

`pnpm check:fast`: **PASS**. Two pre-existing cross-cutting checks needed
updates in the same pass (both are ratchets by design, not accounts/crm
files):

- `api/src/domains/accounts/authorization/admin-routes.json` - the 4 new
  `requireAdmin` routes (`GET /api/inbox`, `PATCH /api/inbox/:key/read`,
  `PATCH /api/users/:id`, `POST /api/leads/:id/convert`) added to the reviewed
  inventory `lint:test`'s `admin-routes.test.ts` diffs against.
- `api/scripts/audit-silent-mutations.ts` - `markRead` (both tables) and
  `attachToUser` (both tables) discard their result with no `RETURNING`; added
  as `ACCEPTED` entries (zero rows matched is a normal outcome for both - see
  the entries' own reasoning) rather than raising the fixed `CEILING`, since a
  reasoned exemption is the mechanism the script itself asks for.

Contract regeneration hit unrelated dev drift: `pnpm --filter @dorado/contracts
generate` fails on `rates.rate_history`, a table with no `ENTITY` mapping and
no migration or commit on any branch (the same class of drift
`docs/history`/`FOLLOWUPS.md` already records for `metals.purity_labels` from
another in-flight lane). Not this lane's to fix. The generator got partway
through the schema list before failing and had already rewritten
`leads/leads.ts`'s generated region correctly; `auth/users.ts`,
`crm/sms_messages.ts` and `crm/calls.ts` were hand-edited to add exactly the
columns the three migrations add, in the same format the generator produces -
regenerating once the drift is fixed elsewhere should be a no-op diff.
