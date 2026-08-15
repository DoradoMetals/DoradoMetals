-- no-transaction
--
-- Index every foreign key column.
--
-- Postgres indexes the primary key side of a foreign key automatically but not
-- the referencing side, so every join from a child row back to its parent was
-- a sequential scan. The composed order queries join seven tables at once, so
-- this is the hot path.
--
-- CONCURRENTLY so that adding these does not block writes on a live table.
-- That cannot run inside a transaction, hence the no-transaction directive and
-- IF NOT EXISTS on every statement: a partial failure is safe to re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_account_user_id"
  ON exchange."account" ("userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_account_transactions_purchase_order_id"
  ON exchange."account_transactions" ("purchase_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_account_transactions_sales_order_id"
  ON exchange."account_transactions" ("sales_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_account_transactions_user_id"
  ON exchange."account_transactions" ("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_addresses_user_id"
  ON exchange."addresses" ("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_auctions_current_item_id"
  ON exchange."auctions" ("current_item_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_carrier_pickups_order_id"
  ON exchange."carrier_pickups" ("order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_carrier_pickups_user_id"
  ON exchange."carrier_pickups" ("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cart_items_product_id"
  ON exchange."cart_items" ("product_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_order_metals_purchase_order_id"
  ON exchange."order_metals" ("purchase_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_order_metals_sales_order_id"
  ON exchange."order_metals" ("sales_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payment_intents_purchase_order_id"
  ON exchange."payment_intents" ("purchase_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payment_intents_sales_order_id"
  ON exchange."payment_intents" ("sales_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payment_intents_session_id"
  ON exchange."payment_intents" ("session_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payouts_order_id"
  ON exchange."payouts" ("order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_payouts_user_id"
  ON exchange."payouts" ("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_metal_id"
  ON exchange."products" ("metal_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_mint_id"
  ON exchange."products" ("mint_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_products_supplier_id"
  ON exchange."products" ("supplier_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_purchase_order_items_product_id"
  ON exchange."purchase_order_items" ("product_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_purchase_order_items_purchase_order_id"
  ON exchange."purchase_order_items" ("purchase_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_purchase_order_items_scrap_id"
  ON exchange."purchase_order_items" ("scrap_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_purchase_orders_address_id"
  ON exchange."purchase_orders" ("address_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_purchase_orders_user_id"
  ON exchange."purchase_orders" ("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refiner_metals_purchase_order_id"
  ON exchange."refiner_metals" ("purchase_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_refiner_metals_sales_order_id"
  ON exchange."refiner_metals" ("sales_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sales_order_items_product_id"
  ON exchange."sales_order_items" ("product_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sales_order_items_sales_order_id"
  ON exchange."sales_order_items" ("sales_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sales_orders_address_id"
  ON exchange."sales_orders" ("address_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sales_orders_supplier_id"
  ON exchange."sales_orders" ("supplier_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sales_orders_user_id"
  ON exchange."sales_orders" ("user_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_scrap_gem_id"
  ON exchange."scrap" ("gem_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_scrap_metal_id"
  ON exchange."scrap" ("metal_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sell_cart_items_cart_id"
  ON exchange."sell_cart_items" ("cart_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sell_cart_items_product_id"
  ON exchange."sell_cart_items" ("product_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sell_cart_items_scrap_id"
  ON exchange."sell_cart_items" ("scrap_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_session_impersonated_by"
  ON exchange."session" ("impersonatedBy");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_session_user_id"
  ON exchange."session" ("userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipments_carrier_id"
  ON exchange."shipments" ("carrier_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipments_purchase_order_id"
  ON exchange."shipments" ("purchase_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_shipments_sales_order_id"
  ON exchange."shipments" ("sales_order_id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tracking_events_shipment_id"
  ON exchange."tracking_events" ("shipment_id");
