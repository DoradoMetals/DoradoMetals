-- A LEAD ESTIMATE IS ROWS, AND EVERY SET IT DRAWS FROM IS ROWS TOO.
--
-- The Lead screen's Estimate card lets an employee tap in what the customer
-- says they have - a weight, a metal, a purity - before any metal arrives.
-- Those lines are facts about the conversation, so they are rows:
-- leads.estimate_items, one per line.
--
-- Ruling 116: the fixed sets are lookup tables with a `key` and a `label`,
-- seeded here, not enums and not TypeScript constants. Two are new:
--   leads.estimate_kinds  scrap | bullion
--   leads.weight_units    troy_oz | g | dwt | lb, each with its gram factor
-- `grams` is a COLUMN, so the troy-ounce constant lives in the troy_oz row
-- and the pricing SQL divides by it rather than carrying 31.1034768 itself.
--
-- THE THIRD SET ALREADY EXISTS AND IS NOT DUPLICATED. metals.purity_labels
-- (migration 175) already holds 10K/14K/18K/22K/24K for Gold and .999/.925
-- (sterling)/.900/.800 for Silver, each with its exact fineness in `purity`,
-- and the Assay Results document already prints from it. `purity_id` points
-- there. No second purity table, and no duplicate "Sterling" row beside the
-- ".925" one that already means it.
--
-- PRICE IS NEVER STORED (rulings 34/41). An item carries weight, unit, metal
-- and purity; what it is worth comes from GET /api/pricing/lead-estimates at
-- current spot.
--
-- Exactly one of purity_id / custom_purity is set - a CHECK, because a line
-- with both would have two fineness answers and a line with neither cannot
-- be priced at all.
--
-- Purely additive: three new tables in a schema that already exists.
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS leads.estimate_kinds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS leads.weight_units (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  grams numeric NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

CREATE TABLE IF NOT EXISTS leads.estimate_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid NOT NULL,
  kind_id uuid NOT NULL,
  metal_id text NOT NULL,
  weight numeric NOT NULL,
  unit_id uuid NOT NULL,
  purity_id uuid,
  custom_purity numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_kinds_pkey') THEN
    ALTER TABLE leads.estimate_kinds ADD CONSTRAINT estimate_kinds_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weight_units_pkey') THEN
    ALTER TABLE leads.weight_units ADD CONSTRAINT weight_units_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weight_units_grams_positive') THEN
    ALTER TABLE leads.weight_units ADD CONSTRAINT weight_units_grams_positive
      CHECK (grams > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_pkey') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_lead_fk') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_lead_fk
      FOREIGN KEY (lead_id) REFERENCES leads.leads (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_kind_fk') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_kind_fk
      FOREIGN KEY (kind_id) REFERENCES leads.estimate_kinds (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_unit_fk') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_unit_fk
      FOREIGN KEY (unit_id) REFERENCES leads.weight_units (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_metal_fk') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_metal_fk
      FOREIGN KEY (metal_id) REFERENCES metals.metals (id) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_purity_fk') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_purity_fk
      FOREIGN KEY (purity_id) REFERENCES metals.purity_labels (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_weight_positive') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_weight_positive
      CHECK (weight > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_one_purity') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_one_purity
      CHECK ((purity_id IS NULL) <> (custom_purity IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_items_custom_purity_range') THEN
    ALTER TABLE leads.estimate_items ADD CONSTRAINT estimate_items_custom_purity_range
      CHECK (custom_purity IS NULL OR (custom_purity > 0 AND custom_purity <= 1));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS estimate_kinds_key ON leads.estimate_kinds (key);
CREATE UNIQUE INDEX IF NOT EXISTS weight_units_key ON leads.weight_units (key);
CREATE INDEX IF NOT EXISTS estimate_items_lead ON leads.estimate_items (lead_id);
CREATE INDEX IF NOT EXISTS estimate_items_metal ON leads.estimate_items (metal_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.estimate_kinds
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.weight_units
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.estimate_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO leads.estimate_kinds (key, label, sort_order)
SELECT v.key, v.label, v.sort_order
  FROM (VALUES
    ('scrap',   'Scrap',   1),
    ('bullion', 'Bullion', 2)
  ) AS v(key, label, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM leads.estimate_kinds k WHERE k.key = v.key
 );

-- The gram factors are the defined ones, not measured: a troy ounce IS
-- 31.1034768 g and a pennyweight is a twentieth of it, by definition.
INSERT INTO leads.weight_units (key, label, grams, sort_order)
SELECT v.key, v.label, v.grams, v.sort_order
  FROM (VALUES
    ('troy_oz', 'troy oz',      31.1034768, 1),
    ('g',       'g',             1.0,       2),
    ('dwt',     'dwt',           1.55517384, 3),
    ('lb',      'lb',          453.59237,   4)
  ) AS v(key, label, grams, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM leads.weight_units u WHERE u.key = v.key
 );

DO $$
DECLARE
  kinds int;
  units int;
BEGIN
  SELECT count(*) INTO kinds FROM leads.estimate_kinds;
  SELECT count(*) INTO units FROM leads.weight_units;
  RAISE NOTICE 'leads.estimate_kinds holds % row(s), leads.weight_units holds % row(s)',
    kinds, units;
END $$;
