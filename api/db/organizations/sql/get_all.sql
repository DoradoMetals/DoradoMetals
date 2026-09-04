SELECT id, image_id, type, name, email, phone, website, description,
       enabled, created_at, updated_at, created_by, updated_by,
       created_by_id, updated_by_id
  FROM organizations.organizations
 ORDER BY created_at DESC, id DESC
