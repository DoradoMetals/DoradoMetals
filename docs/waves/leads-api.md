# Leads API — what the People designs need (lane `leads-api`, 2026-10-08)

Jacob: "let the orchestrator know, it will know what to do with it." The
drawn-versus-exists list is in `docs/design/people-comments-2026-10-07.md`
under "What tonight's design work asks of the API". This wave builds the API
side. Frontend is not touched; breaking it is fine (ruling 99).

## Rulings that bind this lane

- Business facts are rows, not constants (ruling 116). Every fixed set below
  is a lookup table with a `key` and a `label`, seeded by migration.
- Store facts, derive labels in SQL. Statuses and stages are derived in SQL
  views; the frontend never computes state. Money is never stored for an
  estimate; it is derived by the pricing domain from current spot.
- Only `pricing` prices (`lint:pricing-owner`). A customer-visible number
  comes from a pricing endpoint. Ids in, data out: the client sends ids.
- PATCH for edits, actions only for side effects (ruling 114). One endpoint
  per resource, owned by the domain that owns the table.
- Repos are five verbs over one table; a view builds its JSON in SQL, never
  stitched in TypeScript (`lint:no-dictionaries`, `lint:no-literal-views`).
- The database creates ids and stamps audit columns. Defaults live in the
  database.
- No comments in code (ruling 54/109); SQL header comments allowed.
- Verify before dropping or re-typing a column. Dev row counts prove nothing;
  `PROD_READONLY_DATABASE_URL` is read-only and for counts only, never rows.
- Migrations are `api/migrations/232_*.sql` onward, applied to dev and the
  local test database only. Never production.
- Tests move with their subject; every new repo and service gets tests.

## Scope, biggest first

1. **Lead estimate.** New tables under `leads`: `estimate_items (id, lead_id,
   kind_id, metal_id, weight numeric, unit_id, purity_id, custom_purity
   numeric null, …audit)`, with lookups `estimate_kinds` (scrap · bullion),
   `weight_units` (troy_oz · g · dwt · lb, each with its gram factor as a
   column) and `purities` (10K · 14K · 18K · 22K · 24K · Sterling · .999, each
   with its fine fraction). Reuse an existing purity or karat table if the
   scrap declaration model already has one; do not create a second. Exactly
   one of `purity_id` / `custom_purity` is set (CHECK). Endpoints under
   `crm/leads`: `GET/POST /api/leads/:id/estimate/items`,
   `PATCH/DELETE /api/leads/:id/estimate/items/:itemId`. Pricing endpoint:
   `GET /api/pricing/lead-estimates?lead_ids=…` returns `{lead_id, total}` and
   `GET /api/pricing/lead-estimates/:leadId` returns per-item values and the
   total, priced at current spot, computed in pricing SQL. The leads list
   stays bare rows; the frontend composes the two.
2. **Source and contact preference.** `leads.sources` lookup (sell_form ·
   trade_referral · customer_referral · self_created · walk_in) and
   `leads.contact_preferences` lookup (text · call · email). Add
   `source_id` and `contact_preference_id` to `leads.leads`. The existing
   free-text `source` (migration 208) and `contact` columns stay until the
   data is verified: write a backfill that maps recognisable values and
   reports the unmapped count; the drop is a later wave.
3. **Lead timeline.** `GET /api/leads/:id/timeline`, a SQL view over facts
   that already exist (calls, texts, emails, notes, consent, estimate items,
   assignment, conversion, creation), each row `{at, kind, actor_id,
   actor_name, summary, detail}` with the actor read from the audit columns.
   Kinds are a lookup `crm.timeline_kinds` if a kinds table does not already
   exist; look first. Lead notes: find where crm2 put them; if notes exist
   only for customers, add `leads.notes` mirroring that table.
4. **Lead number.** `leads.leads.number text NOT NULL UNIQUE DEFAULT
   'LEAD-' || nextval('leads.number_seq')`, its own sequence, not the orders
   one (ruling 125 covers orders; a lead is not an order). Backfill existing
   rows in `created_at, id` order.
5. **Lead documents.** `media.pdfs` keys on orders and is append-only. Add
   a link table `leads.documents (lead_id, pdf_id)` and
   `GET/POST /api/leads/:id/documents`, `DELETE /api/leads/:id/documents/:pdfId`
   (the link only; a pdf row is never deleted). Uploads reuse the documents
   domain's existing upload path; max 3 per lead is a rule in `rules.ts`.
6. **Funnel.** `GET /api/leads/funnel` → one SQL view:
   `{open, unassigned, never_contacted, both, response_rate_by_channel:
   {text, call, email}, conversion_rate, median_hours_to_first_contact}`.
   Targets for conversion and time-to-first-contact are rows in a
   `crm.targets` table (key, value), not constants.
7. **Customer reviews aggregate.** The customers list view gains
   `review_count` and `review_rating_avg` from the `reviews` schema, in SQL.

## Mechanics

- Lane worktree: `/home/jtj60/dorado-lanes/leads-api` (branch
  `lane/leads-api` off `dev`). Never touch `api/.env`; never commit.
- Local Postgres on 127.0.0.1:5544; `TEST_DATABASE_URL` in `api/.env` points
  at a `test*` database; migrations auto-apply there.
- Regenerate contracts and genesis: `pnpm --filter @dorado/contracts build`,
  `pnpm --filter @dorado/api dump:schema` after the migrations run on dev.
- Gate before reporting: `pnpm check:fast` must be green; run
  `pnpm --filter @dorado/api test` in full. The orchestrator runs the full
  `pnpm check` at merge.
- Report: files added/changed, migrations, endpoints, test counts, anything
  you could not verify. Counts, never customer rows.
