-- A new row. An explicit id wins; NULL generates one. hidden defaults to
-- false through COALESCE rather than a bare column default, because the
-- caller may legitimately omit it and the two schemas must agree on what
-- that becomes (Jacob's correction on this batch - defaults live in SQL,
-- not in a service's `?? false`).
INSERT INTO reviews.reviews
       (id, name, review_text, rating, hidden, created_by, updated_by)
VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, COALESCE($5, false), $6, $7)
RETURNING id, name, review_text, rating, hidden, created_at, updated_at,
          created_by, updated_by
