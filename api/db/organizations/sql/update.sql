-- An organization's contact details.
--
-- NOT keyed through whatever owns it. The old carrier update did
-- `UPDATE organizations o ... FROM shipping.carriers c WHERE c.organization_id
-- = o.id AND c.id = $5` - a write to this table that had to know about
-- carriers. The caller resolves the organization_id and this statement touches
-- one table.
UPDATE organizations.organizations
   SET name = $1, email = $2, phone = $3, enabled = $4, updated_at = NOW()
 WHERE id = $5
RETURNING id, type, name, email, phone, enabled, created_at, updated_at
