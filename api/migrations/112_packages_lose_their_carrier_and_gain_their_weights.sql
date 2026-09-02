-- THE PACKAGES GET THE SAME CURE THE SERVICES GOT (110 / D208).
--
-- shipping.packages carries the generic boxes duplicated PER CARRIER - Small,
-- Medium and Large Box exist twice - and the frontend ships a hardcoded
-- packageOptions record because nothing served the rows (and the rows lacked
-- the minimum billable weight the selector needs). A customer picking "Small
-- Box" is not picking a carrier's box; the FedEx-branded packaging IS the
-- carrier's and keeps its id.
--
-- carrier_id becomes nullable; three carrier-agnostic generic rows carry the
-- customer offer; min_weight_lb comes from the frontend record that was the
-- only home the number ever had. The per-carrier generic duplicates stay -
-- existing shipments may reference them - but the checkout only resolves the
-- agnostic rows.

ALTER TABLE shipping.packages ALTER COLUMN carrier_id DROP NOT NULL;
ALTER TABLE shipping.packages ADD COLUMN IF NOT EXISTS min_weight_lb numeric;

CREATE UNIQUE INDEX IF NOT EXISTS packages_agnostic_label_key
  ON shipping.packages (label) WHERE carrier_id IS NULL;

INSERT INTO shipping.packages
  (carrier_id, label, length, width, height, is_carrier_packaging, min_weight_lb)
VALUES
  (NULL, 'Small Box',  9,  6,  2, false,  2),
  (NULL, 'Medium Box', 14, 10, 4, false,  8),
  (NULL, 'Large Box',  18, 14, 6, false, 20)
ON CONFLICT (label) WHERE carrier_id IS NULL DO NOTHING;

-- The carrier's own packaging keeps its carrier and learns its minimums.
UPDATE shipping.packages SET min_weight_lb = 2  WHERE label = 'FedEx Small';
UPDATE shipping.packages SET min_weight_lb = 5  WHERE label = 'FedEx Medium';
UPDATE shipping.packages SET min_weight_lb = 10 WHERE label = 'FedEx Large';
