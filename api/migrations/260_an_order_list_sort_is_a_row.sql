-- THE ORDER LIST'S SORTS ARE ROWS.
--
-- `GET /api/orders` sorted by `ORDER BY o.created_at DESC, o.id DESC` and
-- nothing else; the Orders list draws a `Sort by` select. Ruling 116: the set
-- an operator picks from is rows with a `key` and a `label`, not a TypeScript
-- union and not an enum.
--
-- A row names WHAT to order by and WHICH WAY, never a fragment of SQL: the
-- CHECK on `sort_field` is the whole vocabulary `list.sql` knows how to order
-- on, and `descending` is a sign, so no statement is ever assembled from a
-- row's text. The lowest `sort_order` is the default the list uses when the
-- caller names no sort.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS orders.list_sorts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  sort_field text NOT NULL,
  descending boolean NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_list_sorts_pkey') THEN
    ALTER TABLE orders.list_sorts ADD CONSTRAINT orders_list_sorts_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_list_sorts_field') THEN
    ALTER TABLE orders.list_sorts ADD CONSTRAINT orders_list_sorts_field
      CHECK (sort_field IN ('created_at', 'estimated_value', 'lot_count', 'arrived_at'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_list_sorts_key ON orders.list_sorts (key);
CREATE UNIQUE INDEX IF NOT EXISTS orders_list_sorts_order ON orders.list_sorts (sort_order);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.list_sorts
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO orders.list_sorts (key, label, sort_field, descending, sort_order)
SELECT v.key, v.label, v.sort_field, v.descending, v.sort_order
  FROM (VALUES
    ('newest',       'Newest first',   'created_at',      true,  1),
    ('oldest',       'Oldest first',   'created_at',      false, 2),
    ('value_high',   'Highest value',  'estimated_value', true,  3),
    ('value_low',    'Lowest value',   'estimated_value', false, 4),
    ('lots_most',    'Most lots',      'lot_count',       true,  5),
    ('lots_fewest',  'Fewest lots',    'lot_count',       false, 6),
    ('arrived_last', 'Arrived last',   'arrived_at',      true,  7),
    ('arrived_first','Arrived first',  'arrived_at',      false, 8)
  ) AS v(key, label, sort_field, descending, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM orders.list_sorts s WHERE s.key = v.key);
