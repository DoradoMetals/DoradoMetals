-- A NOTE MAY BELONG TO A REFINER ORDER.
--
-- The Create Order drawer's Review step takes a note for every kind of order.
-- A customer order keeps it on orders.orders.notes; a refiner order has no
-- notes column, so its note is a crm.notes row. crm.notes gains
-- `refining_order_id` and the one-subject check (287, 293) is extended to it:
-- a note still has exactly one subject.
--
-- Additive: one nullable column, its foreign key and index, and the check
-- replaced by a wider one that every existing row already meets.
-- `exchange` is neither read nor written.

ALTER TABLE crm.notes ADD COLUMN IF NOT EXISTS refining_order_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_refining_order_fk') THEN
    ALTER TABLE crm.notes ADD CONSTRAINT notes_refining_order_fk
      FOREIGN KEY (refining_order_id) REFERENCES refining.orders (id);
  END IF;
END $$;

ALTER TABLE crm.notes DROP CONSTRAINT IF EXISTS notes_exactly_one_subject;
ALTER TABLE crm.notes ADD CONSTRAINT notes_exactly_one_subject
  CHECK (num_nonnulls(user_id, lead_id, order_id, refining_order_id) = 1);

CREATE INDEX IF NOT EXISTS notes_refining_order ON crm.notes (refining_order_id, created_at);
