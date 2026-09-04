INSERT INTO organizations.organizations (id, type, name, email, phone, enabled)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, type, name, email, phone, enabled, created_at, updated_at
