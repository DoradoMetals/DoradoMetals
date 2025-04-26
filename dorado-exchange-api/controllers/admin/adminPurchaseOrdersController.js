const pool = require("../../db");

const getAllPurchaseOrders = async (req, res) => {
  try {
    const query = `
      SELECT 
        po.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', poi.id,
          'purchase_order_id', poi.purchase_order_id,
          'price', poi.price,
          'quantity', poi.quantity,
          'item_type', CASE 
            WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
            WHEN poi.product_id IS NOT NULL THEN 'product'
            ELSE 'unknown'
          END,
          'scrap', jsonb_build_object(
            'id', s.id,
            'gross', s.gross,
            'purity', s.purity,
            'content', s.content,
            'gross_unit', s.gross_unit,
            'metal', ms.type
          ),
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
          'id', ship.id,
          'order_id', ship.order_id,
          'tracking_number', ship.tracking_number,
          'carrier', ship.carrier,
          'shipping_status', ship.shipping_status,
          'estimated_delivery', ship.estimated_delivery,
          'shipped_at', ship.shipped_at,
          'delivered_at', ship.delivered_at,
          'created_at', ship.created_at,
          'label_type', ship.label_type,
          'pickup_type', ship.pickup_type,
          'package', ship.package,
          'shipping_label', encode(ship.shipping_label, 'base64')
        ) AS shipment,
        to_jsonb(cp) AS carrier_pickup,
        to_jsonb(pay) AS payout,
        jsonb_build_object(
          'user_name', u.name,
          'user_email', u.email
        ) AS user
      FROM exchange.purchase_orders po
      LEFT JOIN exchange.purchase_order_items poi ON poi.purchase_order_id = po.id
      LEFT JOIN exchange.scrap s ON poi.scrap_id = s.id
      LEFT JOIN exchange.products p ON poi.product_id = p.id
      LEFT JOIN exchange.metals ms ON s.metal_id = ms.id
      LEFT JOIN exchange.metals mp ON p.metal_id = mp.id
      LEFT JOIN exchange.addresses addr ON addr.id = po.address_id
      LEFT JOIN exchange.inbound_shipments ship ON ship.order_id = po.id
      LEFT JOIN exchange.carrier_pickups cp ON cp.order_id = po.id
      LEFT JOIN exchange.payouts pay ON pay.order_id = po.id
      LEFT JOIN exchange.users u ON u.id = po.user_id
      GROUP BY po.id, addr.id, ship.id, cp.id, pay.id, u.id
      ORDER BY po.created_at DESC;
    `;

    const values = [];
    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const changePurchaseOrderStatus = async (req, res) => {
  const { order_status, order_id, user_name } = req.body;
  console.log(req.body)

  try {
    const query = `
      UPDATE exchange.purchase_orders
      SET 
        purchase_order_status = $1, 
        updated_at = NOW(), 
        updated_by = $2
      WHERE id = $3
      RETURNING *
    `;

    const values = [order_status, user_name, order_id];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Purchase Order not found' });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error updating Purchase Order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAllPurchaseOrders,
  changePurchaseOrderStatus,
};
