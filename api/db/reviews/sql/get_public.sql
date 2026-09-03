-- The reviews an anonymous visitor sees.
--
-- `hidden = false` is the ENTIRE difference between this and get_all, and it is
-- the reason the two are separate statements rather than one with a flag. They
-- were one missing clause apart once, on a route with no guard in front of it -
-- so the clause is not optional and not a parameter.
SELECT id, review_text, created_at, updated_at, rating,
       created_by, updated_by, name, hidden
  FROM reviews.reviews
 WHERE hidden = false
 ORDER BY created_at DESC, id DESC
