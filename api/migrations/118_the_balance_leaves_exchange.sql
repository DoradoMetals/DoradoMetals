-- The customer credit balance stops being written to exchange.
--
-- *** THE LAST APPLICATION WRITE TO exchange. *** D212 purged every other one;
-- `exchange.users.dorado_funds` survived because 107's cutover split the user
-- row by COLUMN - identity flowed auth -> exchange, the balance flowed
-- exchange -> auth - and features/users still owned the balance write. This
-- migration moves the balance to the side that already owns the row, so
-- `auth.users` owns every column of a user and exchange owns none.
--
-- *** WHAT MOVES, AND WHAT DOES NOT. *** Not one exchange row is read, written,
-- altered or dropped here. `exchange.users.dorado_funds` keeps the value it
-- holds at the moment this runs, readable forever, and simply stops changing -
-- which is ruling 36 ("yes exchange can stop receiving those writes") applied
-- to the one write that had not yet stopped. The covenant is about ROWS and
-- TABLES; a trigger is neither.
--
-- *** WHY THE FUNDS MIRROR HAS TO GO RATHER THAN JUST BEING UNUSED. *** With
-- the application writing auth.users, leaving `mirror_funds_to_auth` in place
-- means two directions can fight: any later write to exchange.users.dorado_funds
-- - a hand-run UPDATE, a restored backup, a migration - would overwrite the
-- live balance in auth.users with a frozen number, silently, with no error.
-- That is 056's $1000 bug pointing the other way. Retiring the trigger is what
-- makes the direction one-way rather than merely conventional.
--
-- *** THE IDENTITY MIRROR STAYS, AND GETS NARROWED. *** Features still join
-- exchange.users for a name or an email, so `mirror_identity_to_exchange` must
-- keep them fresh. But it fired on EVERY update of auth.users, and after this
-- change a balance adjustment IS an update of auth.users - so the funds write
-- would have started writing exchange.users through the back door, defeating
-- the whole point. The one AFTER INSERT OR UPDATE trigger is therefore split:
-- an INSERT trigger (unchanged behaviour - a new signup still seeds its
-- exchange row) and an UPDATE trigger scoped with `UPDATE OF <identity
-- columns>`. A column-list trigger fires when the statement MENTIONS one of
-- those columns, so `SET dorado_funds = ...` alone does not fire it and
-- everything better-auth writes still does. The function body is untouched:
-- it never copied dorado_funds on conflict anyway.
--
-- Reversible, and the reverse is exactly 107's tail:
--   DROP TRIGGER mirror_identity_to_exchange_insert ON auth.users;
--   DROP TRIGGER mirror_identity_to_exchange_update ON auth.users;
--   CREATE TRIGGER mirror_identity_to_exchange
--     AFTER INSERT OR UPDATE ON auth.users FOR EACH ROW
--     EXECUTE FUNCTION auth.mirror_identity_to_exchange();
--   CREATE OR REPLACE FUNCTION exchange.mirror_funds_to_auth() ... (107, verbatim)
--   CREATE TRIGGER mirror_funds_to_auth
--     AFTER UPDATE OF dorado_funds ON exchange.users FOR EACH ROW
--     WHEN (OLD.dorado_funds IS DISTINCT FROM NEW.dorado_funds)
--     EXECUTE FUNCTION exchange.mirror_funds_to_auth();
-- and re-point db/users/sql/adjust_credit.sql back at exchange.users. Balances
-- written to auth.users while flipped would then need carrying back by hand;
-- payments.ledger is the record of every one of them.
--
-- lint:migrations does NOT refuse anything below: its seven destructive shapes
-- are DROP TABLE / DROP SCHEMA / TRUNCATE / DELETE FROM / UPDATE / DROP COLUMN
-- / narrowing ALTER COLUMN TYPE, all against exchange TABLES. No
-- `allow-destructive:` marker is needed and none is claimed - dropping a
-- trigger removes no row.

-- ------------------------------------------- 1. the funds mirror is retired
DROP TRIGGER IF EXISTS mirror_funds_to_auth ON exchange.users;
DROP FUNCTION IF EXISTS exchange.mirror_funds_to_auth();

-- ------------------------------- 2. the identity mirror stops seeing a funds
--                                    write as an identity change
DROP TRIGGER IF EXISTS mirror_identity_to_exchange ON auth.users;

CREATE TRIGGER mirror_identity_to_exchange_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.mirror_identity_to_exchange();

-- The column list is exactly what the function copies, plus the two timestamps
-- it also carries. dorado_funds is the one column of auth.users deliberately
-- absent from it, which is the whole change.
CREATE TRIGGER mirror_identity_to_exchange_update
  AFTER UPDATE OF email, name, "createdAt", "updatedAt", "emailVerified",
                  image, role, "stripeCustomerId", banned, "banReason", "banExpires"
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.mirror_identity_to_exchange();
