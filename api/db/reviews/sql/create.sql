-- A new row. An explicit id wins; NULL generates one. hidden defaults to false through COALESCE, not a service's `?? false` - defaults live in SQL.
-- Audit columns are written by public.audit_stamp from the connection actor, not this statement; still projected since the wire carries them.
INSERT INTO reviews.reviews
       (id, name, review_text, rating, hidden)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, COALESCE($5, false))
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
