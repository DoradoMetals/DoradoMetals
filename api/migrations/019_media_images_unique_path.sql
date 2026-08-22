-- Restore the uniqueness media.images was missing.
--
-- exchange.images has UNIQUE (path, filename, user_id), and insertImage depends
-- on it: the whole write is an ON CONFLICT upsert against exactly that key.
-- Without the constraint the ON CONFLICT clause has no arbiter and the
-- statement fails outright - re-uploading the same file would error rather than
-- replace, which is the one thing that code path exists to do.
--
-- Checked against the data first: no duplicate (path, filename, user_id) in
-- either table, so this is additive and would fail rather than drop a row if
-- that were untrue.

ALTER TABLE media.images
  ADD CONSTRAINT images_path_filename_user_unique UNIQUE (path, filename, user_id);
