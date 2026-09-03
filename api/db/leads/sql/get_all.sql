-- Every lead, newest first.
--
-- created_at is not unique, so id breaks the tie. Without a unique ORDER BY the
-- rows come back in physical order, which changes as rows are updated and makes
-- two implementations look like they disagree when they do not.
SELECT id, name, phone, email, created_at, updated_at, last_contacted,
       converted, contacted, responded, created_by, updated_by,
       notes, contact, priority
  FROM leads.leads
 ORDER BY created_at DESC, id DESC
