-- Remove an organization.
--
-- Called by the carriers service when a carrier is deleted: a carrier IS an
-- organization, so deleting one deletes both rows. It goes through this repo
-- rather than a DELETE written inside carriers, for the same reason the update
-- does - one table, one writing service.
DELETE FROM organizations.organizations WHERE id = $1
