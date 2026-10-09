-- THE ACTIVITY FEED'S KINDS ARE ROWS, AND THE TABLE FOR THEM ALREADY EXISTS.
--
-- GET /api/activity merges every dated fact about a person across the CRM, and
-- ruling 116 says its kinds are rows with a key and a label. Migration 235
-- created crm.timeline_kinds for exactly that and called itself "the superset"
-- - so this adds the three keys the feed needs and that the lead timeline did
-- not: a credit movement, and the two lead stages that became moments in 251.
-- No second kinds table.
--
-- `Raised Maryam Shahrokhi to high priority` is drawn on the same card and is
-- NOT added here: leads.leads.priority keeps no history, so a field-level
-- change to it cannot be reconstructed from any column that exists. That
-- needs a fact first, and it is not this wave's.
--
-- THE TWO INDEXES. The feed filters by ACTOR, so created_by_id becomes an
-- access path on the two busiest fact tables. crm.calls and crm.sms_messages
-- carried the column since migration 116 and nothing had ever read it as a
-- filter before.
--
-- Purely additive: three lookup rows and two indexes. `exchange` is neither
-- read nor written.

INSERT INTO crm.timeline_kinds (key, label, sort_order)
SELECT v.key, v.label, v.sort_order
  FROM (VALUES
    ('contacted', 'Contacted', 10),
    ('responded', 'Responded', 11),
    ('credit',    'Credit',    12)
  ) AS v(key, label, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM crm.timeline_kinds k WHERE k.key = v.key);

CREATE INDEX IF NOT EXISTS calls_created_by ON crm.calls (created_by_id);
CREATE INDEX IF NOT EXISTS sms_messages_created_by ON crm.sms_messages (created_by_id);

DO $$
DECLARE
  kinds int;
BEGIN
  SELECT count(*) INTO kinds FROM crm.timeline_kinds;
  RAISE NOTICE 'crm.timeline_kinds holds % row(s)', kinds;
END $$;
