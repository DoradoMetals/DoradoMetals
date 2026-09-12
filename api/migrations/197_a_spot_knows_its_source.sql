-- A spot price now says whether it is LIVE, MANUAL or STALE (Jacob's Spots
-- screen, docs/design/rates-spots-screens.md #2). MANUAL and STALE are both
-- facts the row already half-carries - updated_at existed but was never
-- returned, and "how old is too old" was about to become a TypeScript
-- constant. Ruling 116: a business fact is a row, not a constant, so the
-- threshold gets a table.
--
-- spots.settings is a SINGLETON: one row, its id pinned to `true` by the
-- CHECK, so there is exactly one threshold and never a second one an admin
-- forgot to update. spots.overrides is one row per metal - a metal is either
-- overridden or it is not - carrying the pair pricing actually reads (bid AND
-- ask, not one), the reason and an optional expiry. The audit_stamp trigger
-- (116_the_database_stamps_who_and_when.sql) is installed on it exactly the
-- way it already is on spots.spots.
--
-- Nothing here changes what the feed writes. pricing/spots/service.ts skips a
-- metal with a standing override so the next tick cannot erase it silently -
-- that is application code, not this migration.

CREATE TABLE IF NOT EXISTS spots.settings (
  id boolean PRIMARY KEY DEFAULT true,
  stale_after_seconds integer NOT NULL DEFAULT 60,
  CONSTRAINT spots_settings_singleton CHECK (id),
  CONSTRAINT spots_settings_positive_threshold CHECK (stale_after_seconds > 0)
);

INSERT INTO spots.settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS spots.overrides (
  metal_id text PRIMARY KEY REFERENCES metals.metals(id) ON UPDATE CASCADE,
  bid numeric NOT NULL,
  ask numeric NOT NULL,
  reason text NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by text DEFAULT '' NOT NULL,
  updated_by text DEFAULT '' NOT NULL,
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id)
);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON spots.overrides
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();
