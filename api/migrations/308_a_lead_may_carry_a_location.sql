-- A LEAD MAY CARRY A LOCATION (ruling 165).
--
-- City and state, both nullable, nothing requires them. Pure DDL; `exchange`
-- is neither read nor written.

ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE leads.leads ADD COLUMN IF NOT EXISTS state text;
