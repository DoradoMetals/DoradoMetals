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
          'shipping_label', encode(ship.shipping_label, 'base64'),
          'shipping_charge', ship.net_charge,
          'shipping_service', ship.service_type
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

const getAdminPurchaseOrderMetals = async (req, res) => {
  const { purchase_order_id } = req.body;

  if (!purchase_order_id) {
    return res.status(400).json({ error: "Missing purchase_order_id" });
  }

  try {
    const query = `
      SELECT 
        id,
        purchase_order_id,
        type,
        ask_spot,
        bid_spot,
        percent_change,
        dollar_change,
        scrap_percentage,
        created_at,
        updated_at
      FROM exchange.order_metals
      WHERE purchase_order_id = $1
      ORDER BY type ASC;
    `;

    const values = [purchase_order_id];
    const result = await pool.query(query, values);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching purchase order metals:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const changePurchaseOrderStatus = async (req, res) => {
  const { order_status, order_id, user_name } = req.body;

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
      return res.status(404).json({ error: "Purchase Order not found" });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error updating Purchase Order status:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateOrderScrapPercentage = async (req, res) => {
  const { spot, scrap_percentage } = req.body;

  try {
    const query = `
      UPDATE exchange.order_metals
      SET scrap_percentage = $1 
      WHERE purchase_order_id = $2
      AND type = $3
      RETURNING *
    `;

    const values = [scrap_percentage, spot.purchase_order_id, spot.type];

    const result = await pool.query(query, values);
    res.status(200).json({ result });
  } catch (error) {
    console.error("Error updating scrap percentage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const resetOrderScrapPercentage = async (req, res) => {
  const { spot } = req.body;

  try {
    const query = `
      UPDATE exchange.order_metals om
      SET scrap_percentage = m.scrap_percentage
      FROM exchange.metals m
      WHERE om.purchase_order_id = $1
        AND om.type = m.type
        AND om.type = $2
      RETURNING om.*;
    `;

    const values = [spot.purchase_order_id, spot.type];

    const result = await pool.query(query, values);
    res.status(200).json({ result });
  } catch (error) {
    console.error("Error resetting scrap percentage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateOrderSpot = async (req, res) => {
  const { spot, updated_spot } = req.body;

  try {
    const query = `
      UPDATE exchange.order_metals
      SET bid_spot = $1 
      WHERE purchase_order_id = $2
      AND type = $3
      RETURNING *
    `;

    const values = [updated_spot, spot.purchase_order_id, spot.type];

    const result = await pool.query(query, values);
    res.status(200).json({ result });
  } catch (error) {
    console.error("Error updating scrap percentage:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const lockOrderSpots = async (req, res) => {
  const { spots, purchase_order_id } = req.body;
  console.log(purchase_order_id)
  try {
    const updates = await Promise.all(
      spots.map(async (spot) => {
        const query = `
          UPDATE exchange.order_metals
          SET bid_spot = $1
          WHERE purchase_order_id = $2 AND type = $3
          RETURNING *;
        `;

        const values = [spot.bid_spot, purchase_order_id, spot.type];
        const result = await pool.query(query, values);
        return result.rows[0];
      })
    );

    res.status(200).json({ result: updates });
  } catch (error) {
    console.error("Error locking order spot prices:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const resetOrderSpots = async (req, res) => {
  const { purchase_order_id } = req.body;

  try {
    const query = `
      UPDATE exchange.order_metals
      SET bid_spot = NULL
      WHERE purchase_order_id = $1
      RETURNING *;
    `;

    const values = [purchase_order_id];
    const result = await pool.query(query, values);
    res.status(200).json({ result: result.rows });
  } catch (error) {
    console.error("Error resetting order spot prices:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAllPurchaseOrders,
  getAdminPurchaseOrderMetals,
  changePurchaseOrderStatus,
  updateOrderScrapPercentage,
  resetOrderScrapPercentage,
  updateOrderSpot,
  lockOrderSpots,
  resetOrderSpots,
};
