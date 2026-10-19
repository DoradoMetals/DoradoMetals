-- AN ESTIMATE ITEM HOLDS A SET OF IMAGES (ruling 137).
--
-- leads.estimate_item_images is a pure link between a leads.estimate_items row
-- and a media.images row, ordered by sort_order, with the house audit columns
-- that public.audit_stamp() fills: the twin of inventory.lot_images (migration
-- 284). Unlinking removes the link only; the image row stays. Removing an
-- estimate item removes its links with it, never the images.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS leads.estimate_item_images (
  estimate_item_id uuid NOT NULL,
  image_id uuid NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_item_images_pkey') THEN
    ALTER TABLE leads.estimate_item_images ADD CONSTRAINT estimate_item_images_pkey
      PRIMARY KEY (estimate_item_id, image_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'estimate_item_images_estimate_item_id_fkey') THEN
    ALTER TABLE leads.estimate_item_images ADD CONSTRAINT estimate_item_images_estimate_item_id_fkey
      FOREIGN KEY (estimate_item_id) REFERENCES leads.estimate_items (id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'estimate_item_images_image_id_fkey') THEN
    ALTER TABLE leads.estimate_item_images ADD CONSTRAINT estimate_item_images_image_id_fkey
      FOREIGN KEY (image_id) REFERENCES media.images (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'estimate_item_images_created_by_id_fkey') THEN
    ALTER TABLE leads.estimate_item_images ADD CONSTRAINT estimate_item_images_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'estimate_item_images_updated_by_id_fkey') THEN
    ALTER TABLE leads.estimate_item_images ADD CONSTRAINT estimate_item_images_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS estimate_item_images_item_sort
  ON leads.estimate_item_images (estimate_item_id, sort_order);
CREATE INDEX IF NOT EXISTS estimate_item_images_image ON leads.estimate_item_images (image_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON leads.estimate_item_images
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
