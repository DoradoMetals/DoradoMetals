-- TWELVE OF THE TWENTY-SEVEN NOT NULLs `audit:constraints` REPORTS. D63.
--
-- The other fifteen are ACCEPTED by name in the audit itself, with the
-- measurement that makes each one structural: ten are sales-order money columns
-- landing in orders.transactions, a table that merges purchase and sales orders
-- where exchange.purchase_orders HAS NO SUCH COLUMN, so NOT NULL cannot hold
-- for the merged row. D63 measured that the wrong way round once and nearly
-- reported fourteen missing order totals; one GROUP BY reversed it. This file
-- is the other half - the ones where nothing structural stops the guard, the
-- new schema simply lost it.
--
-- EVERY ONE WAS CHECKED THE SAME THREE WAYS: does the merged table's other
-- parent have the column and is it also NOT NULL; does every write path in the
-- code supply a value; and how many rows hold NULL today, in DEV and where the
-- table has a production counterpart, IN PRODUCTION. Never from dev row counts
-- alone - dev holds tens of rows.
--
-- AND ONE PROPERTY THEY ALL SHARE, which is what makes them safe: exchange is
-- written FIRST in every dual write here, inside the same transaction, so a
-- value these would refuse is already refused by exchange's own NOT NULL one
-- statement earlier. Adding them changes nothing that can happen today and
-- keeps it true after exchange stops being written.
--
--   leads.leads.priority                exchange.leads.priority NOT NULL
--     DEFAULT 'Medium'. features/leads/sql/create.sql already COALESCEs a null
--     caller value to 'Medium'; 39 dev rows, 0 null.
--
--   rates.rates.created_by / updated_by exchange.rates NOT NULL DEFAULT
--     'Dorado Admin'. features/rates/repo.ts passes `created_by ?? null`
--     explicitly, so an omitted user name is refused by exchange today and will
--     be refused here tomorrow - the same behaviour, in the schema that will
--     still be there. 16 dev rows, 0 null.
--
--   spots.spots.ask                     exchange.metals.ask_spot NOT NULL (bid
--     is nullable in both and stays so). The upsert COALESCEs against the
--     existing row, so an UPDATE can never blank it; only a first INSERT for a
--     brand-new metal could, and exchange would refuse the same write. A blank
--     ask prices every scrap line at zero. 4 dev rows, 0 null.
--
--   products.bullion.quantity           exchange.products.quantity NOT NULL
--     DEFAULT 0. No default is added here on purpose: its sibling `stock` is
--     NOT NULL with no default, and products/sql/create.sql passes exchange's
--     defaults explicitly rather than relying on the column (see its header).
--     62 dev rows, 0 null.
--
--   orders.orders.number                BOTH parents are NOT NULL -
--     exchange.purchase_orders.order_number and sales_orders.order_number - so
--     this is the one order-table column in the report with nothing structural
--     about it. All three insert paths draw it from an exchange sequence, which
--     cannot return null. 63 dev rows and 72 production orders, 0 null.
--
--   shipping.pickups.status             exchange.carrier_pickups.pickup_status
--     NOT NULL, with the allowlist restored in 101. 0 rows either side.
--
--   payments.intents.type               exchange.payment_intents.type NOT NULL.
--     `type` is `string | undefined` all the way down service.ts, so exchange
--     is what refuses an undefined one today. 21 dev rows, 0 null.
--
--   payments.attempts.provider_ref      exchange.payment_intents.
--   payments.settlements.provider_ref   payment_intent_id NOT NULL. Both are
--     written from `payment_intent.id`, which Stripe always supplies. The
--     THIRD target of that column - payments.details.provider_ref - is accepted
--     in the audit instead, because a payout account has no provider reference
--     at all (16 of 22 dev rows null, every one payout-derived). 21 attempts
--     and 1 settlement on dev, 0 null.
--
--   payments.ledger.occurred_at         AND THIS ONE IS A LIVE DEFECT, not a
--     promotion hazard. exchange.account_transactions.occurred_at is NOT NULL
--     *DEFAULT now()*, and features/transactions/sql/create.sql - the ledger
--     insert - does not name the column, relying on that default. Its successor
--     payments.ledger.occurred_at is nullable AND HAS NO DEFAULT, so the next
--     credit-ledger entry written through the live path lands with no time on
--     it. It has not happened yet only because all 19 dev rows came from 061's
--     backfill and nothing has written since. This is the customer credit
--     ledger - $66,999.32 across eight customers in production. The DEFAULT is
--     the fix; the NOT NULL is the guard that makes it stay fixed.
--
-- Additive, on the new schemas only. exchange is untouched.

ALTER TABLE leads.leads       ALTER COLUMN priority     SET NOT NULL;

ALTER TABLE rates.rates       ALTER COLUMN created_by   SET NOT NULL;
ALTER TABLE rates.rates       ALTER COLUMN updated_by   SET NOT NULL;

ALTER TABLE spots.spots       ALTER COLUMN ask          SET NOT NULL;

ALTER TABLE products.bullion  ALTER COLUMN quantity     SET NOT NULL;

ALTER TABLE orders.orders     ALTER COLUMN number       SET NOT NULL;

ALTER TABLE shipping.pickups  ALTER COLUMN status       SET NOT NULL;

ALTER TABLE payments.intents     ALTER COLUMN type         SET NOT NULL;
ALTER TABLE payments.attempts    ALTER COLUMN provider_ref SET NOT NULL;
ALTER TABLE payments.settlements ALTER COLUMN provider_ref SET NOT NULL;

ALTER TABLE payments.ledger   ALTER COLUMN occurred_at  SET DEFAULT now();
ALTER TABLE payments.ledger   ALTER COLUMN occurred_at  SET NOT NULL;

COMMENT ON COLUMN payments.ledger.occurred_at IS
  'When the credit movement happened. NOT NULL DEFAULT now(), matching exchange.account_transactions.occurred_at - the ledger insert does not name this column and relied on a default the new schema did not have.';
