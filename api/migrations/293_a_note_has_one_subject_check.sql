-- A NOTE HAS ONE SUBJECT CHECK, NOT TWO.
--
-- 287 replaced crm.notes' two-subject check (notes_one_subject, from 252) with
-- notes_exactly_one_subject over user, lead and order, but dropped the old one
-- only inside its IF NOT EXISTS branch. On a replay, 252 re-adds the old check
-- after genesis already holds the new one, 287 skips its branch, and the old
-- check survives and refuses every order note. verify:replay caught it. 287 now
-- drops the old check unconditionally (it runs on a replay as a backfill);
-- this file, pure DDL and stamped under the baseline, did the same on dev.
--
-- A constraint only; no row is read or written. `exchange` is untouched.

ALTER TABLE crm.notes DROP CONSTRAINT IF EXISTS notes_one_subject;
