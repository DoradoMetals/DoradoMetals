-- Remove an image, scoped to its owner - the user_id clause is the backstop that makes the ownership check unbypassable from any future caller.
DELETE FROM media.images WHERE id = $1 AND user_id = $2
