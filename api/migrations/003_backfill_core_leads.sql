-- Bring core.leads' data up to date with exchange.leads.
--
-- core.leads was populated by a one-off copy in January and has drifted: rows
-- created since are missing and rows edited since are stale. This is the
-- forward sync, run immediately before the leads feature switches over.
--
-- Written as an upsert keyed on id so it is idempotent - running it twice, or
-- re-running after a partial failure, converges to the same state. It only ever
-- writes to core; exchange.leads is the source and is left untouched, which is
-- what makes the switchover reversible.

INSERT INTO core.leads (
  id, name, phone, email, created_at, updated_at, last_contacted,
  converted, contacted, responded, created_by, updated_by, notes, contact, priority
)
SELECT
  e.id, e.name, e.phone, e.email, e.created_at, e.updated_at, e.last_contacted,
  e.converted, e.contacted, e.responded, e.created_by, e.updated_by, e.notes, e.contact, e.priority
FROM exchange.leads e
ON CONFLICT (id) DO UPDATE SET
  name           = EXCLUDED.name,
  phone          = EXCLUDED.phone,
  email          = EXCLUDED.email,
  created_at     = EXCLUDED.created_at,
  updated_at     = EXCLUDED.updated_at,
  last_contacted = EXCLUDED.last_contacted,
  converted      = EXCLUDED.converted,
  contacted      = EXCLUDED.contacted,
  responded      = EXCLUDED.responded,
  created_by     = EXCLUDED.created_by,
  updated_by     = EXCLUDED.updated_by,
  notes          = EXCLUDED.notes,
  contact        = EXCLUDED.contact,
  priority       = EXCLUDED.priority;
