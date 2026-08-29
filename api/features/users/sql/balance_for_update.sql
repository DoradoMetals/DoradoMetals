-- One customer's credit balance, LOCKED for the rest of the transaction.
--
-- D98. The balance was read in the BROWSER, adjusted there, and PUT back as an
-- absolute total - so two admins with the drawer open both computed from the
-- same stale number and the second write silently discarded the first. That is
-- a lost update on a ledger holding $66,999.32 across 8 customers.
--
-- `FOR UPDATE` is what makes the fix complete rather than merely better. The
-- delta statement next to it is atomic on its own, but the FLOOR CHECK is not:
-- read-then-decide-then-write is a race whatever the write looks like. Taking
-- the row here holds it until the adjustment commits, so two concurrent
-- subtractions cannot both pass a check that only one of them can honour.
SELECT dorado_funds
  FROM exchange.users
 WHERE id = $1
   FOR UPDATE
