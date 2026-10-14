-- A SOURCE IS NAMED ON INSERT, AND THE THREE SEEDED SOURCES BY NAME.
--
-- 278 made spots.sources.name NOT NULL. Genesis is dumped from dev, so a
-- rebuild creates the column NOT NULL before 240 and 277 insert their sources
-- without a name, and those inserts would fail. spots.source_name() is a
-- BEFORE INSERT trigger that gives a nameless row its id, which keeps every
-- earlier insert valid. On a rebuild 278 then finds no NULL to fill, so this
-- file sets the three seeded names again, exactly as dev holds them.
--
-- `exchange` is neither read nor written.

CREATE OR REPLACE FUNCTION spots.source_name() RETURNS trigger
LANGUAGE plpgsql
AS $source_name$
BEGIN
  NEW.name := COALESCE(NEW.name, NEW.id);
  RETURN NEW;
END;
$source_name$;

CREATE OR REPLACE TRIGGER source_name BEFORE INSERT ON spots.sources
  FOR EACH ROW EXECUTE FUNCTION spots.source_name();

UPDATE spots.sources
   SET name = CASE id WHEN 'nfusion' THEN 'nFusion Solutions'
                      WHEN 'kitco' THEN 'Kitco'
                      ELSE 'LBMA' END
 WHERE id IN ('nfusion', 'kitco', 'lbma');
