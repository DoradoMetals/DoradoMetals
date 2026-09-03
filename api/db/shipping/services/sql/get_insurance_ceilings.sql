-- What we will insure a parcel for, per active service of one carrier. Deliberately NOT part of get_all's projection - max_insured_value would be a wire change there for no consumer's benefit.
-- Keyed by `name`, not `code`: `code` is NULL on every row today. Switch the join when it's populated - nothing else changes.
SELECT id, name, max_insured_value
  FROM shipping.services
 WHERE carrier_id = $1
   AND is_active = true
