-- Remove a postal address.
--
-- The service only calls this once nothing points at it any more - no
-- user_addresses link and no order snapshot. An address that has left somebody's
-- book has not stopped being the place a parcel was sent.
DELETE FROM places.addresses WHERE id = $1
