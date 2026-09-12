-- A nearest-label lookup with no bound is not a lookup, it is a nearest
-- neighbour, and on scrap it lies: 0.059 silver came back `.800` and 0.011
-- platinum came back `.900`. A label names a STANDARD, so it applies only
-- within reach of the standard it names.
--
-- The bound is per label because the standards are not evenly spaced: half the
-- distance to that metal's next standard, capped at 0.02. Silver's .925 and
-- .900 sit 0.025 apart, so each reaches 0.0125; everything else is far enough
-- from its neighbour that the 0.02 cap is what binds. 14K therefore covers
-- 0.5633 to 0.6033, which is the karat band a refiner would recognise.
--
-- Outside every band there is no label and the percentage stands alone.
--
-- Additive: one column on a reference table this chain created two migrations
-- ago, with its seeded values. `exchange` is neither read nor written.

ALTER TABLE metals.purity_labels
  ADD COLUMN IF NOT EXISTS tolerance numeric NOT NULL DEFAULT 0.02;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purity_labels_tolerance') THEN
    ALTER TABLE metals.purity_labels ADD CONSTRAINT purity_labels_tolerance
      CHECK (tolerance > 0 AND tolerance <= 0.05);
  END IF;
END $$;

UPDATE metals.purity_labels
   SET tolerance = 0.0125
 WHERE metal_id = 'Silver'
   AND label IN ('.925', '.900');
