# CRM facts (lane `crm-facts`, queued 2026-10-09, runs after `leads-api`)

Source: `docs/design/api-gaps-people.md` (the audit of the People design
against `dev`). Rulings as in `docs/waves/leads-api.md`. Runs on top of the
`leads-api` lane's branch so the two do not collide on `crm/leads`.

## Scope, bugs first

1. **Audit columns that silently do not exist.** `payments.ledger` and
   `media.pdfs` carry the `audit_stamp` trigger but no `created_by_id` /
   `updated_by_id`; add both columns to both tables so the trigger writes
   them, and backfill nothing (the past is unknown; leave NULL).
2. **Convert loses notes.** `crm/leads/service.ts convert()` attaches texts
   and calls and never copies the lead's notes to the customer; fix, with a
   test.
3. **Lead stage facts are booleans.** `leads.leads.contacted / responded /
   converted` become `contacted_at / responded_at / converted_at`
   timestamps (keep the booleans until the backfill is verified, then a
   later wave drops them); `lead_stage` derives from the timestamps.
4. **Consent is a fact row, not a nullable column.** Add
   `crm.sms_consent_events (user_id | lead_id, kind opt_in | opt_out,
   method, at, …audit)`; STOP writes an opt_out row instead of only nulling
   `sms_consent_at`; the current state stays derived.
5. **Assignment history.** `crm.assignments (subject user_id | lead_id,
   assigned_to_id, assigned_at, …audit)` written on every assign/reassign;
   the current `assigned_to_id` columns stay as the derived "current".
6. **Notes are rows.** `crm.notes (user_id | lead_id, body, …audit)` with
   actor and timestamp; `auth.users.notes` and `leads.leads.notes` are
   backfilled as one row each and stay until verified; timeline note rows
   read the table.
7. **Activity feed.** `GET /api/activity?employee_id=&limit=` as a SQL view
   over facts that exist (calls, texts, emails, notes, assignments,
   consent events, ledger rows, stage timestamps, conversions), each row
   `{at, kind, actor, subject, summary}`; the employee screen filters to
   one actor.
8. **Small reads.** `last_contact` includes emails and notes; the inbox
   list exposes `channel` (sms · call · voicemail) per row; customer state
   derives `deletion_requested`; calls and texts carry the employee who
   placed them (`created_by_id` already exists; expose it in the reads).

Migrations are `api/migrations/250_*.sql` onward.
