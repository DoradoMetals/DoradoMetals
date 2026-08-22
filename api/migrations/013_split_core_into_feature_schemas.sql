-- One feature per schema. core is dissolved.
--
-- core had become the same kind of grab-bag exchange is, just smaller: nine
-- tables belonging to six different features. Keeping a trimmed-down core would
-- have left a place for the next unowned table to land, so it goes entirely and
-- every table moves to a schema named for what owns it.
--
--   leads.leads                  nothing else references it
--   reviews.reviews              nothing else references it
--   rates.rates                  nothing else references it
--   spots.spots                  nothing else references it
--   products.mints               only bullion references it, and bullion is
--   products.bullion             product data
--   media.images                 the media feature owns images; payments,
--                                places and shipping reference them
--   organizations.organizations  mints, suppliers and refiners are all
--                                organizations; referenced by places, refiners
--                                and shipping
--   metals.metals                reference data for spots, rates, products and
--                                scrap. Its own schema rather than a shared
--                                bucket, so that what depends on it is visible
--                                rather than hidden behind a vague name.
--
-- ALTER TABLE ... SET SCHEMA moves the table itself. Rows, indexes, constraints
-- and foreign keys all follow it - nothing is copied and nothing is rewritten,
-- so there is no window where data exists in one place and not the other.
-- Cross-schema foreign keys are unaffected; Postgres tracks them by object, not
-- by name.
--
-- core also holds a function, convert_to_troy_oz, which moves to metals: weight
-- conversion is metals-domain. It has no callers - no column default, no
-- generated column, and nothing in the API - and it duplicates
-- shared/utils/convertWeights.js, which differs in that the SQL returns NULL on
-- an unknown unit where the JS returns 0. Moved rather than dropped, because
-- deleting something on the way past is how you find out later that it mattered.
--
-- The DROP is RESTRICT, so it fails rather than cascades if anything was left
-- behind. exchange is untouched.

CREATE SCHEMA IF NOT EXISTS leads;
CREATE SCHEMA IF NOT EXISTS reviews;
CREATE SCHEMA IF NOT EXISTS rates;
CREATE SCHEMA IF NOT EXISTS spots;
CREATE SCHEMA IF NOT EXISTS products;
CREATE SCHEMA IF NOT EXISTS media;
CREATE SCHEMA IF NOT EXISTS organizations;
CREATE SCHEMA IF NOT EXISTS metals;

ALTER TABLE core.leads         SET SCHEMA leads;
ALTER TABLE core.reviews       SET SCHEMA reviews;
ALTER TABLE core.rates         SET SCHEMA rates;
ALTER TABLE core.spots         SET SCHEMA spots;
ALTER TABLE core.mints         SET SCHEMA products;
ALTER TABLE core.bullion       SET SCHEMA products;
ALTER TABLE core.images        SET SCHEMA media;
ALTER TABLE core.organizations SET SCHEMA organizations;
ALTER TABLE core.metals        SET SCHEMA metals;

ALTER FUNCTION core.convert_to_troy_oz(numeric, text) SET SCHEMA metals;

DROP SCHEMA core RESTRICT;
