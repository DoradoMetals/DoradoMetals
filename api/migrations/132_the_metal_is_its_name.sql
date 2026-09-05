-- The metal's id becomes its name (ruling 79). Nothing in exchange moves.
--
-- The eight columns convert with ALTER ... USING rather than an UPDATE so the
-- audit_stamp trigger (116) never fires: a type change is not an edit, and
-- rewriting updated_at on every product and rate would lose the real dates.

DROP VIEW IF EXISTS metals.exchange_compat;

ALTER TABLE checkout.items DROP CONSTRAINT checkout_items_metal_fk;
ALTER TABLE orders.items DROP CONSTRAINT order_items_metal_id_fkey;
ALTER TABLE orders.spots DROP CONSTRAINT order_spots_metal_id_fkey;
ALTER TABLE products.bullion DROP CONSTRAINT bullion_metal_id_fkey;
ALTER TABLE rates.rates DROP CONSTRAINT migration_rates_metal_fk;
ALTER TABLE refiners.items DROP CONSTRAINT refiner_items_metal_id_fkey;
ALTER TABLE refiners.spots DROP CONSTRAINT refiner_spots_metal_id_fkey;
ALTER TABLE spots.spots DROP CONSTRAINT current_spots_metal_id_fkey;

CREATE FUNCTION metals.name_of(p uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN (SELECT m.name FROM metals.metals m WHERE m.id = p); END $$;

ALTER TABLE checkout.items ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE orders.items ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE orders.spots ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE products.bullion ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE rates.rates ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE refiners.items ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE refiners.spots ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);
ALTER TABLE spots.spots ALTER COLUMN metal_id TYPE text USING metals.name_of(metal_id);

DROP FUNCTION metals.name_of(uuid);

ALTER TABLE metals.metals ALTER COLUMN id DROP DEFAULT;
ALTER TABLE metals.metals DROP CONSTRAINT metals_pkey;
ALTER TABLE metals.metals DROP CONSTRAINT metals_name_key;
ALTER TABLE metals.metals ALTER COLUMN id TYPE text USING name;
ALTER TABLE metals.metals DROP COLUMN name;
ALTER TABLE metals.metals ADD CONSTRAINT metals_pkey PRIMARY KEY (id);

ALTER TABLE checkout.items ADD CONSTRAINT checkout_items_metal_fk
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
ALTER TABLE orders.items ADD CONSTRAINT order_items_metal_id_fkey
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
ALTER TABLE orders.spots ADD CONSTRAINT order_spots_metal_id_fkey
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
ALTER TABLE products.bullion ADD CONSTRAINT bullion_metal_id_fkey
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE rates.rates ADD CONSTRAINT migration_rates_metal_fk
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
ALTER TABLE refiners.items ADD CONSTRAINT refiner_items_metal_id_fkey
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
ALTER TABLE refiners.spots ADD CONSTRAINT refiner_spots_metal_id_fkey
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;
ALTER TABLE spots.spots ADD CONSTRAINT current_spots_metal_id_fkey
  FOREIGN KEY (metal_id) REFERENCES metals.metals(id) ON UPDATE CASCADE;

-- id and type are both the name now; the exchange row named it type.
CREATE VIEW metals.exchange_compat AS
 SELECT m.id,
    m.id AS type,
    s.ask AS ask_spot,
    s.bid AS bid_spot,
    s.percent_change,
    s.dollar_change
   FROM metals.metals m
     LEFT JOIN spots.spots s ON s.metal_id = m.id;
