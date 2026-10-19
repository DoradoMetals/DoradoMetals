-- A LEAD IS ARCHIVED, NEVER DELETED (ruling 162).
--
-- leads.leads.archived_at is the moment a lead was archived. DELETE
-- /api/leads/:id stamps it and POST /api/leads/:id/restore clears it; the list
-- hides a lead that carries it unless the Archived filter is asked for. No
-- application statement deletes a lead row.
--
-- Purely additive. `exchange` is neither read nor written.

ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS leads_archived_at ON leads.leads (archived_at)
  WHERE archived_at IS NOT NULL;
