-- A lead's estimate as checkout scrap lines, for the convert that carries the
-- estimate onto the new customer's purchase checkout. The fine fraction is the
-- purity label's, or the item's custom purity; the lot unit is the weight
-- unit's key, except troy ounces, which a lot spells 't oz'.
--
-- A bullion estimate item carries as a weight-based scrap lot too. That is
-- correct: an estimate item names no product, and the estimate priced it by
-- weight and fine fraction, so the lot keeps exactly what was quoted. It moves
-- to a product lot once estimate items carry a product.
SELECT i.metal_id,
       i.weight AS pre_melt,
       coalesce(p.purity, i.custom_purity) AS purity,
       CASE u.key WHEN 'troy_oz' THEN 't oz' ELSE u.key END AS unit
  FROM leads.estimate_items i
  JOIN leads.weight_units u ON u.id = i.unit_id
  LEFT JOIN metals.purity_labels p ON p.id = i.purity_id
 WHERE i.lead_id = $1
 ORDER BY i.created_at ASC, i.id ASC
