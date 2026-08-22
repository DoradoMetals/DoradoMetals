-- Prepare products.mints to take over from exchange.mints.
--
-- Three things, all restorations rather than changes.
--
-- 1. exchange.mints.description has no column in products.mints, because a
--    description belongs to the organization the mint is, not to the mint row.
--    Nine of the ten mints have no description at all; only "Varies" does, and
--    its organization's description is still null, so the January copy moved
--    the column but not the one value in it. Moved here, conditionally, so a
--    description someone has since written on the organization is not
--    overwritten by the older one.
--
--    website is the same shape of move and needs no data step: no mint has one
--    and no organization has one.
--
-- 2. products.mints lost UNIQUE (name). exchange has enforced it since the
--    table was created and the API looks mints up by name -
--    products/repo.exchange.js resolves mint_id with
--    `SELECT id FROM mints WHERE name = $12` - so a duplicate name would make
--    that subquery return two rows and the insert would fail at runtime
--    instead of at write time.
--
-- 3. products.mints lost the CHECK on type. Both values in use are covered;
--    this only stops a third from appearing.
--
-- exchange is untouched.

UPDATE organizations.organizations o
SET description = e.description
FROM products.mints p
JOIN exchange.mints e ON e.id = p.id
WHERE o.id = p.organization_id
  AND o.description IS NULL
  AND e.description IS NOT NULL;

ALTER TABLE products.mints ADD CONSTRAINT mints_name_key UNIQUE (name);

ALTER TABLE products.mints ADD CONSTRAINT mints_type_check
  CHECK (type = ANY (ARRAY['Private'::text, 'Sovereign'::text]));
