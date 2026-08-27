-- Remove an image, SCOPED TO ITS OWNER.
--
-- The user_id clause is not redundant with the service's ownership check - it
-- is the backstop that makes the check unbypassable from any future caller.
-- Deliberately kept from the previous implementation, which had this right.
DELETE FROM media.images WHERE id = $1 AND user_id = $2
