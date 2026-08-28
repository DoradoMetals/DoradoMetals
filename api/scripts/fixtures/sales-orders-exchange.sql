-- The exchange projection for a sales order, kept alive for the gate.
--
-- features/sales-orders/repo.exchange.js is DELETED - the feature reads the new
-- schema and dual-writes now. But `verify:sales-order-decomposition` still has
-- to compare against what exchange holds, or it compares the read service with
-- itself and passes unconditionally. That is the failure this project has been
-- bitten by before, and it is why this file exists rather than the script
-- importing something that no longer answers the question.
--
-- CONVERTED WITH THE ORDERS WIRE (D84). Lifted verbatim from repo.exchange.js
-- at the commit that deleted it, then given the same shape conversion every
-- live read got, derived from exchange's flat columns exactly as
-- repo.exchange.js's purchase-order query derives its own: order_number ->
-- number, sales_order_status -> status, the money nested as `totals` under
-- orders.transactions' names (order_total -> total, item_total -> items,
-- shipping_cost -> shipping, charges_amount -> surcharge, pre_charges_amount
-- -> funds, the rest 1:1; refiner_fee NULL because exchange never had it),
-- the address as a snapshot, the item's product speaking the schema's names.
-- Still a FIXTURE, not a code path: nothing in the application reads it, and
-- it goes when exchange does.
SELECT
      so.id,
      so.user_id,
      so.address_id,
      so.sales_order_status AS status,
      so.notes,
      so.created_at,
      so.updated_at,
      so.created_by,
      so.updated_by,
      so.order_number AS number,
      so.review_created,
      so.shipping_service,
      so.used_funds,
      so.order_sent,
      so.tracking_updated,
      so.supplier_id,
      jsonb_build_object(
        'total', so.order_total,
        'items', so.item_total,
        'shipping', so.shipping_cost,
        'surcharge', so.charges_amount,
        'sales_tax', so.sales_tax,
        'funds', so.pre_charges_amount,
        'refiner_fee', NULL,
        'base_total', so.base_total,
        'subject_to_charges_amount', so.subject_to_charges_amount,
        'post_charges_amount', so.post_charges_amount
      ) AS totals,
      json_agg(DISTINCT jsonb_build_object(
        'id', soi.id,
        'sales_order_id', soi.sales_order_id,
        'price', soi.price,
        'quantity', soi.quantity,
        'premium', soi.premium,
        'product', jsonb_build_object(
          'id', p.id,
          'name', p.product_name,
          'description', p.product_description,
          'type', p.product_type,
          'metal_type', mp.type,
          'content', p.content,
          'gross', p.gross,
          'purity', p.purity,
          'bid_premium', p.bid_premium,
          'ask_premium', p.ask_premium,
          'image_front', p.image_front,
          'image_back', p.image_back,
          'mint_name', pmnt.name
        )
      )) AS order_items,
      CASE WHEN addr.id IS NULL THEN NULL ELSE jsonb_build_object(
        'address_id', addr.id,
        'recipient_name', addr.name,
        'line_1', addr.line_1,
        'line_2', addr.line_2,
        'city', addr.city,
        'state', addr.state,
        'country', addr.country,
        'country_code', addr.country_code,
        'zip', addr.zip,
        'phone_number', addr.phone_number,
        'is_residential', addr.is_residential,
        'is_valid', addr.is_valid
      ) END AS address,
      jsonb_build_object(
        'user_id', u.id,
        'user_name', u.name,
        'user_email', u.email
      ) AS "user",
      jsonb_build_object(
        'id', ship.id,
        'purchase_order_id', ship.purchase_order_id,
        'sales_order_id', ship.sales_order_id,
        'tracking_number', ship.tracking_number,
        'shipping_status', ship.shipping_status,
        'estimated_delivery', ship.estimated_delivery,
        'shipped_at', ship.shipped_at,
        'delivered_at', ship.delivered_at,
        'created_at', ship.created_at,
        'label_type', ship.label_type,
        'pickup_type', ship.pickup_type,
        'package', ship.package,
        'shipping_label', encode(ship.shipping_label, 'base64'),
        'shipping_charge', ship.net_charge,
        'shipping_service', ship.service_type,
        'insured', ship.insured,
        'declared_value', ship.declared_value,
        'type', ship.type,
        'carrier_id', ship.carrier_id
      ) AS shipment
    FROM exchange.sales_orders so
    LEFT JOIN exchange.sales_order_items soi ON soi.sales_order_id = so.id
    LEFT JOIN exchange.products p ON soi.product_id = p.id
    LEFT JOIN exchange.mints pmnt ON pmnt.id = p.mint_id
    LEFT JOIN exchange.metals mp ON p.metal_id = mp.id
    LEFT JOIN exchange.addresses addr ON addr.id = so.address_id
    LEFT JOIN exchange.users u ON u.id = so.user_id
    LEFT JOIN exchange.shipments ship ON ship.sales_order_id = so.id
    GROUP BY so.id, addr.id, u.id, ship.id
    ORDER BY so.created_at DESC, so.id DESC
