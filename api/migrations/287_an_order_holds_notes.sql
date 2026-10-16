-- AN ORDER HOLDS NOTES, IN THE ONE NOTES TABLE (ruling 148 companion).
--
-- Notes are rows, and one crm.notes serves every subject (migration 252, Jacob's
-- notes-as-rows ruling). An order becomes a third subject: crm.notes gains
-- order_id, and the one-subject check widens from two columns to three. The
-- author is the audit stamp, created_by_id (ruling 127).
--
-- THE FREE-TEXT COLUMN STAYS. orders.orders.notes is backfilled as ONE row per
-- order that has text, dated by the order's own updated_at, with no author
-- (none was ever recorded), exactly as 252 did for customers and leads. The
-- column is not dropped here. A re-run adds nothing (NOT EXISTS).
--
-- The constraint is replaced, not data: the widened check accepts every row
-- the old one did. `exchange` is neither read nor written.

ALTER TABLE crm.notes ADD COLUMN IF NOT EXISTS order_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_order_fk') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_order_fk
      FOREIGN KEY (order_id) REFERENCES orders.orders (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_exactly_one_subject') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_exactly_one_subject
      CHECK (num_nonnulls(user_id, lead_id, order_id) = 1);
  END IF;
END $$;

ALTER TABLE crm.notes DROP CONSTRAINT IF EXISTS notes_one_subject;

CREATE INDEX IF NOT EXISTS notes_order ON crm.notes (order_id, created_at);

INSERT INTO crm.notes (order_id, body, created_at, updated_at)
SELECT o.id, o.notes, COALESCE(o.updated_at, o.created_at, now()),
       COALESCE(o.updated_at, o.created_at, now())
  FROM orders.orders o
 WHERE o.notes IS NOT NULL
   AND btrim(o.notes) <> ''
   AND NOT EXISTS (SELECT 1 FROM crm.notes n WHERE n.order_id = o.id);
