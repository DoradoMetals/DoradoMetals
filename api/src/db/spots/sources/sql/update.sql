-- An edit of the two plain facts. A key the patch leaves out keeps its value;
-- is_default is never written here, only by make_default, which moves it.
UPDATE spots.sources
   SET enabled = COALESCE($2::boolean, enabled),
       sort_order = COALESCE($3::integer, sort_order)
 WHERE id = $1
RETURNING id
