-- A VISITOR'S CHECKOUT CHANGES HANDS (ruling 63). Signing in re-keys the row
-- rather than copying it, so the lines, the choices and the row's own id all
-- follow in one write and nothing is left behind to reconcile.
--
-- The unique index on (user_id, direction) is the guard: the caller has already
-- established that the new owner has no row for this direction, and if that
-- stops being true this raises 23505 rather than minting a second one.
UPDATE checkout.checkouts
   SET user_id = $2
 WHERE id = $1
