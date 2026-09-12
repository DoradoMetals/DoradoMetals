-- Unread has no column anywhere (statuses.md CRM section, the Inbox screen).
-- read_at is null on an inbound row until an admin opens the conversation,
-- and is set at insert for an outbound one - Dorado sent it, so it is read by
-- definition. Existing rows backfill to their own timestamp, so shipping this
-- does not flag months of history as unread. Additive; exchange is neither
-- read nor written.

ALTER TABLE crm.sms_messages ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;
ALTER TABLE crm.calls ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;

UPDATE crm.sms_messages SET read_at = created_at WHERE read_at IS NULL;
UPDATE crm.calls SET read_at = started_at WHERE read_at IS NULL;
