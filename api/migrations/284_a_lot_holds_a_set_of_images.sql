-- A LOT HOLDS A SET OF IMAGES (ruling 137: photos are many to one with a lot).
--
-- inventory.lots.image_id holds ONE photo, so the photo viewer could never open
-- the whole set. inventory.lot_images is the link table: a pure link between
-- a lot and an image, ordered by sort_order, with the house audit columns that
-- public.audit_stamp() fills.
--
-- THE SEED copies every inventory.lots.image_id that is set into one row at
-- sort_order 0. ON CONFLICT DO NOTHING keeps a replay from writing twice.
-- inventory.lots.image_id is NOT dropped here; live code still reads and
-- writes it, and a later lane retires it once nothing does.
--
-- Purely additive. `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS inventory.lot_images (
  lot_id uuid NOT NULL,
  image_id uuid NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by_id uuid,
  updated_by_id uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_images_pkey') THEN
    ALTER TABLE inventory.lot_images ADD CONSTRAINT lot_images_pkey
      PRIMARY KEY (lot_id, image_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_images_lot_id_fkey') THEN
    ALTER TABLE inventory.lot_images ADD CONSTRAINT lot_images_lot_id_fkey
      FOREIGN KEY (lot_id) REFERENCES inventory.lots (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lot_images_image_id_fkey') THEN
    ALTER TABLE inventory.lot_images ADD CONSTRAINT lot_images_image_id_fkey
      FOREIGN KEY (image_id) REFERENCES media.images (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'lot_images_created_by_id_fkey') THEN
    ALTER TABLE inventory.lot_images ADD CONSTRAINT lot_images_created_by_id_fkey
      FOREIGN KEY (created_by_id) REFERENCES auth.users (id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'lot_images_updated_by_id_fkey') THEN
    ALTER TABLE inventory.lot_images ADD CONSTRAINT lot_images_updated_by_id_fkey
      FOREIGN KEY (updated_by_id) REFERENCES auth.users (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS lot_images_lot_sort ON inventory.lot_images (lot_id, sort_order);
CREATE INDEX IF NOT EXISTS lot_images_image ON inventory.lot_images (image_id);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON inventory.lot_images
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO inventory.lot_images (lot_id, image_id, sort_order)
SELECT l.id, l.image_id, 0
  FROM inventory.lots l
  JOIN media.images i ON i.id = l.image_id
 WHERE l.image_id IS NOT NULL
ON CONFLICT (lot_id, image_id) DO NOTHING;
