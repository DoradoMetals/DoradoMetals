-- Remove an organization. Called by the carriers service when a carrier is deleted - a carrier IS an organization, so this deletes both rows.
DELETE FROM organizations.organizations WHERE id = $1
