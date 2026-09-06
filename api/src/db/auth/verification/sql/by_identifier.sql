SELECT id, identifier, value, "expiresAt", "createdAt", "updatedAt"
  FROM auth.verification
 WHERE identifier = $1
 ORDER BY "createdAt" DESC, id DESC
 LIMIT 1
