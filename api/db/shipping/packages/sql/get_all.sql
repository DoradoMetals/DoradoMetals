-- Every package a carrier offers.
--
-- Reference data: eleven rows, seeded. Read once and turned into a Map rather
-- than joined on every shipment read - `pk.label AS package` was one of the
-- four joins the shipment projection carried.
SELECT id, carrier_id, label, length, width, height, is_carrier_packaging,
       image_id, created_at, updated_at
  FROM shipping.packages
 ORDER BY carrier_id ASC, label ASC, id ASC
