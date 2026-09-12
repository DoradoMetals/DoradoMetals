-- A purity is a number, and a customer reads a name: 14K, .925, .950. The
-- Assay Results document prints both, and the nearest standard label for a
-- lot's metal is a lookup rather than a ladder of ifs in code - which is why
-- the labels live here and not in a TypeScript constant.
--
-- `purity` is the exact fineness the label stands for, so "nearest" is one
-- ORDER BY abs(purity - $1) against the metal's own rows. Sort_order carries
-- the order a human lists them in; it is not used for matching.
--
-- Additive: a new table in a schema that already exists, seeded from nothing
-- but this file. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS metals.purity_labels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  metal_id text NOT NULL,
  label text NOT NULL,
  purity numeric NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_labels_pkey') THEN
    ALTER TABLE metals.purity_labels ADD CONSTRAINT purity_labels_pkey PRIMARY KEY (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_labels_metal_fk') THEN
    ALTER TABLE metals.purity_labels ADD CONSTRAINT purity_labels_metal_fk
      FOREIGN KEY (metal_id) REFERENCES metals.metals (id) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_labels_range') THEN
    ALTER TABLE metals.purity_labels ADD CONSTRAINT purity_labels_range
      CHECK (purity > 0 AND purity <= 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS purity_labels_metal_label
  ON metals.purity_labels (metal_id, label);
CREATE INDEX IF NOT EXISTS purity_labels_metal_purity
  ON metals.purity_labels (metal_id, purity);

INSERT INTO metals.purity_labels (metal_id, label, purity, sort_order)
SELECT v.metal_id, v.label, v.purity, v.sort_order
  FROM (VALUES
    ('Gold', '24K', 0.9999, 1),
    ('Gold', '22K', 0.9167, 2),
    ('Gold', '18K', 0.7500, 3),
    ('Gold', '14K', 0.5833, 4),
    ('Gold', '10K', 0.4167, 5),
    ('Silver', '.999', 0.9990, 1),
    ('Silver', '.925', 0.9250, 2),
    ('Silver', '.900', 0.9000, 3),
    ('Silver', '.800', 0.8000, 4),
    ('Platinum', '.950', 0.9500, 1),
    ('Platinum', '.900', 0.9000, 2),
    ('Palladium', '.950', 0.9500, 1),
    ('Palladium', '.500', 0.5000, 2)
  ) AS v(metal_id, label, purity, sort_order)
  JOIN metals.metals m ON m.id = v.metal_id
 WHERE NOT EXISTS (
   SELECT 1 FROM metals.purity_labels p
    WHERE p.metal_id = v.metal_id AND p.label = v.label
 );
