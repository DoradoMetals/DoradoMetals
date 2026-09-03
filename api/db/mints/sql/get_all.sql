-- Every mint, by name.
--
-- ORDERED BY NAME, not by created_at, because this feeds a picker in the admin
-- product form and the reader is looking for a mint alphabetically. The
-- generator's default is newest-first, which is right for a log and wrong here.
--
-- `description` and `website` are NOT projected: exchange.mints has them,
-- products.mints does not, and neither has ever been on this wire.
SELECT id, name, type, country, created_at, updated_at
  FROM products.mints
 ORDER BY name ASC, id ASC
