-- The exchange projection for a sales order, kept alive for the gate.
--
-- features/sales-orders/repo.exchange.js is DELETED - the feature reads the new
-- schema and dual-writes now. But `verify:sales-order-decomposition` still has
-- to compare against what exchange holds, or it compares the read service with
-- itself and passes unconditionally. That is the failure this project has been
-- bitten by before, and it is why this file exists rather than the script
-- importing something that no longer answers the question.
--
-- Lifted verbatim from repo.exchange.js at the commit that deleted it. It is a
-- FIXTURE, not a code path: nothing in the application reads it, and it goes
-- when exchange does.
SELECT
      so.*,
      json_agg(DISTINCT jsonb_build_object(
        'id', soi.id,
        'sales_order_id', soi.sales_order_id,
        'price', soi.price,
        'quantity', soi.quantity,
        'premium', soi.premium,
        'product', jsonb_build_object(
          'id', p.id,
          'product_name', p.product_name,
          'content', p.content,
          'product_type', p.product_type,
          'image_front', p.image_front,
          'image_back', p.image_back,
          'bid_premium', p.bid_premium,
          'ask_premium', p.ask_premium,
          'variant_group', p.variant_group,
          'shadow_offset', p.shadow_offset,
          'metal_type', mp.type
        )
      )) AS order_items,
      to_jsonb(addr) AS address,
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
    LEFT JOIN exchange.metals mp ON p.metal_id = mp.id
    LEFT JOIN exchange.addresses addr ON addr.id = so.address_id
    LEFT JOIN exchange.users u ON u.id = so.user_id
    LEFT JOIN exchange.shipments ship ON ship.sales_order_id = so.id
    GROUP BY so.id, addr.id, u.id, ship.id
    ORDER BY so.created_at DESC, so.id DESC
