-- Remove a postal address. The service only calls this once nothing points at it any more - no user_addresses link and no order snapshot.
DELETE FROM places.addresses WHERE id = $1
