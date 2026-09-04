-- THE PARCEL A PURCHASE CHECKOUT DESCRIBES, copied from the checkout row
-- (ruling 66): the box and the carrier service are columns of it, so nothing
-- reads them out into a row literal first. What is passed is what the server
-- DECIDED - the handoff the chosen method means, and the insured amount
-- already clamped to the service's ceiling (D132).
--
-- A SHELL: every label column is left null because the carrier has not been
-- asked yet (label-after-commit, 2026-09-03). domain/shipping/labels.ts fills
-- them in once it has.
INSERT INTO shipping.shipments (
  id, direction, pickup_type, package_id, carrier_service_id, insured, declared_value
)
SELECT $1, $2::shipping.direction, $3, c.package_id, c.carrier_service_id,
       COALESCE($4, false), $5
  FROM checkout.checkouts c
 WHERE c.id = $6
RETURNING id
