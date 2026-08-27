-- Every row, newest first.
--
-- created_at is not unique, so id breaks the tie. Without a unique ORDER BY the
-- rows come back in physical order, which changes as rows are updated.
SELECT id, image_id, type, name, email, phone, website, description,
       enabled, created_at, updated_at, created_by, updated_by,
       created_by_id, updated_by_id
  FROM organizations.organizations
 ORDER BY created_at DESC, id DESC
