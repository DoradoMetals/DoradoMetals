-- The customer's one state, derived. Q3 of docs/design/api-gaps-people.md:
-- Active, Banned and Deletion requested, from the two facts auth.users
-- actually carries - `banned` and `deletion_requested_at` (migration 217).
-- The Users screen's drawn `Invited` and `Disabled` have no fact on this
-- table: an invite belongs to an employee, and disabled is what banned
-- already means.
--
-- A DELETION REQUEST OUTRANKS A BAN, because it is the one that changes what
-- an employee may do next: texting or deleting someone who asked to be
-- forgotten is the kind of mistake this project cannot undo, and a banned
-- customer who asked to be forgotten drew as plain `Banned` before this.
-- `banned` is nullable, so a NULL falls through to Active.
--
-- Substituted into get_one.sql, get_all.sql and get_admins.sql through
-- /*__customer_state__*/ so no two reads can disagree. `u` is auth.users.
CASE
  WHEN u.deletion_requested_at IS NOT NULL THEN 'Deletion requested'
  WHEN u.banned THEN 'Banned'
  ELSE 'Active'
END
