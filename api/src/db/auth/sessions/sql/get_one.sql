SELECT id, "userId", token, "expiresAt", "createdAt", "updatedAt", "ipAddress",
       "userAgent", "impersonatedBy", factor_changed, stepped_up_at
  FROM auth.sessions
 WHERE id = $1
