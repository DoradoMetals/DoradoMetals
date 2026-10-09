-- The last time anyone at Dorado touched this customer, across every channel
-- the Timeline counts as contact. It used to be texts and calls only, which
-- made the Customers list's `Last contact` column mean something narrower
-- than the Timeline beside it - two screens meaning two things by one word.
-- Emails (media.emails) and notes (crm.notes, migration 252) are in it now.
--
-- Substituted into get_one.sql, get_all.sql and get_admins.sql through
-- /*__last_contact__*/. `u` is auth.users.
greatest(
  (SELECT max(m.created_at) FROM crm.sms_messages m WHERE m.user_id = u.id),
  (SELECT max(c.started_at) FROM crm.calls c WHERE c.user_id = u.id),
  (SELECT max(e.sent_at) FROM media.emails e WHERE e.user_id = u.id),
  (SELECT max(n.created_at) FROM crm.notes n WHERE n.user_id = u.id)
)
