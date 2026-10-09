-- A REFINER ORDER'S DOCUMENTS ARE ROWS.
--
-- `REFINING_DOCUMENTS` was one TypeScript constant holding one row,
-- `[{ kind: 'invoice', name: 'Invoice' }]`, while the refiner screens draw
-- four: Refiner Invoice, Packing List, Settlement and Shipping Instructions.
-- Ruling 116: that set is rows.
--
-- Every kind already exists on `media.pdf_kind`, so no enum value is added and
-- a stored file keeps the kind it was imported under. `renderable` says
-- whether the API can produce the file itself - only the invoice can, and
-- `documentsFor` gates `available` on it, so the other three become available
-- the moment one is imported.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS refining.documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind media.pdf_kind NOT NULL,
  name text NOT NULL,
  renderable boolean DEFAULT false NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refining_documents_pkey') THEN
    ALTER TABLE refining.documents ADD CONSTRAINT refining_documents_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS refining_documents_kind ON refining.documents (kind);
CREATE UNIQUE INDEX IF NOT EXISTS refining_documents_order ON refining.documents (sort_order);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON refining.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO refining.documents (kind, name, renderable, sort_order)
SELECT v.kind::media.pdf_kind, v.name, v.renderable, v.sort_order
  FROM (VALUES
    ('invoice',               'Refiner Invoice',       true,  1),
    ('packing_list',          'Packing List',          false, 2),
    ('settlement',            'Settlement',            false, 3),
    ('shipping_instructions', 'Shipping Instructions', false, 4)
  ) AS v(kind, name, renderable, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM refining.documents d WHERE d.kind = v.kind::media.pdf_kind);
