const pool = require("../../db");
const {
  calculateItemPrice,
  calculateTotalPrice,
} = require("../../utils/price-calculations");

function convertTroyOz(num, unit) {
  if (isNaN(num)) return 0;
  switch (unit.toLowerCase()) {
    case "t oz":
      return num;
    case "g":
      return num / 31.1035;
    case "dwt":
      return num / 20;
    case "lb":
      return num * (453.592 / 31.1035);
    default:
      return 0;
  }
}

const saveOrderItems = async (req, res) => {
  const { ids, purchase_order_id } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "No item IDs provided" });
  }

  try {
    const updates = await Promise.all(
      ids.map(async (id) => {
        const query = `
          UPDATE exchange.purchase_order_items
          SET confirmed = true
          WHERE id = $1 AND purchase_order_id = $2
          RETURNING *;
        `;
        const values = [id, purchase_order_id];
        const result = await pool.query(query, values);
        return result.rows[0];
      })
    );

    res.status(200).json({ result: updates });
  } catch (error) {
    console.error("Error saving order items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const resetOrderItem = async (req, res) => {
  const { id, purchase_order_id } = req.body;

  if (!id || !purchase_order_id) {
    return res.status(400).json({ error: "Missing id or purchase_order_id" });
  }

  try {
    const query = `
      UPDATE exchange.purchase_order_items
      SET confirmed = false
      WHERE id = $1 AND purchase_order_id = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [id, purchase_order_id]);
    res.status(200).json({ result: result.rows[0] });
  } catch (error) {
    console.error("Error resetting item confirmation:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateOrderScrapItem = async (req, res) => {
  const { item } = req.body;

  let content = item.scrap.content;
  if (item.scrap.post_melt) {
    content =
      convertTroyOz(item.scrap.post_melt, item.scrap.gross_unit) *
      item.scrap.purity;
  } else {
    content =
      convertTroyOz(item.scrap.pre_melt, item.scrap.gross_unit) *
      item.scrap.purity;
  }

  try {
    const query = `
      UPDATE exchange.scrap
      SET content = $1, purity = $2, pre_melt = $3, post_melt = $4
      WHERE id = $5
      RETURNING *;
    `;

    const values = [
      content,
      item.scrap.purity,
      item.scrap.pre_melt,
      item.scrap.post_melt,
      item.scrap.id,
    ];
    const result = await pool.query(query, values);
    res.status(200).json({ result: result.rows });
  } catch (error) {
    console.error("Error updating scrap item:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteOrderScrapItem = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .json({ error: "No purchase_order_item IDs provided" });
  }

  try {
    const deletedItems = [];

    for (const id of ids) {
      // 1. Get scrap_id
      const selectQuery = `
        SELECT scrap_id FROM exchange.purchase_order_items
        WHERE id = $1
      `;
      const selectResult = await pool.query(selectQuery, [id]);
      const scrap_id = selectResult.rows[0]?.scrap_id;

      // 2. Delete the purchase_order_item
      const deletePOIQuery = `
        DELETE FROM exchange.purchase_order_items
        WHERE id = $1
        RETURNING *;
      `;
      const poiResult = await pool.query(deletePOIQuery, [id]);

      // 3. Delete the scrap row (only if one was found)
      if (scrap_id) {
        await pool.query(`DELETE FROM exchange.scrap WHERE id = $1`, [
          scrap_id,
        ]);
      }

      if (poiResult.rows.length > 0) {
        deletedItems.push(poiResult.rows[0]);
      }
    }

    res.status(200).json({ result: deletedItems });
  } catch (error) {
    console.error("Error deleting scrap items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const addNewOrderScrapItem = async (req, res) => {
  const { item, purchase_order_id } = req.body;

  try {
    const metalQuery = `
      SELECT id FROM exchange.metals
      WHERE type = $1
      LIMIT 1
    `;
    const metalResult = await pool.query(metalQuery, [item.metal]);
    if (metalResult.rowCount === 0) {
      return res.status(400).json({ error: "Invalid metal type" });
    }
    const metal_id = metalResult.rows[0].id;

    const scrapQuery = `
      INSERT INTO exchange.scrap (
        metal_id, pre_melt, purity, content, gross_unit
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const scrapValues = [
      metal_id,
      item.pre_melt ?? 1,
      item.purity ?? 1,
      item.content ?? (item.pre_melt ?? 1) * (item.purity ?? 1),
      item.gross_unit ?? "t oz",
    ];
    const scrapResult = await pool.query(scrapQuery, scrapValues);
    const scrap_id = scrapResult.rows[0].id;

    const poiQuery = `
      INSERT INTO exchange.purchase_order_items (
        purchase_order_id, scrap_id, quantity, confirmed
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const poiValues = [purchase_order_id, scrap_id, 1, false];
    const poiResult = await pool.query(poiQuery, poiValues);

    res.status(200).json({ item: poiResult.rows[0] });
  } catch (error) {
    console.error("Error adding scrap item:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateOrderBullionItem = async (req, res) => {
  const { item } = req.body;

  try {
    const query = `
      UPDATE exchange.purchase_order_items
      SET quantity = $1, bullion_premium = $2
      WHERE id = $3
      RETURNING *;
    `;

    const values = [item.quantity, item.bullion_premium, item.id];
    const result = await pool.query(query, values);
    res.status(200).json({ result: result.rows });
  } catch (error) {
    console.error("Error updating bullion item:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteOrderBullionItem = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .json({ error: "No purchase_order_item IDs provided" });
  }

  try {
    const deletedItems = [];

    for (const id of ids) {
      const query = `
        DELETE FROM exchange.purchase_order_items
        WHERE id = $1
        RETURNING *;
      `;
      const result = await pool.query(query, [id]);

      if (result.rows.length > 0) {
        deletedItems.push(result.rows[0]);
      }
    }

    res.status(200).json({ result: deletedItems });
  } catch (error) {
    console.error("Error deleting bullion items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const addNewOrderBullionItem = async (req, res) => {
  const { item, purchase_order_id } = req.body;

  try {
    const query = `
      INSERT INTO exchange.purchase_order_items (
        purchase_order_id, product_id, quantity, confirmed
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [purchase_order_id, item.id, 1, false];
    const result = await pool.query(query, values);

    res.status(200).json({ item: result.rows[0] });
  } catch (error) {
    console.error("Error adding product item:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

async function expireStaleOffers() {
  const now = new Date();

  const selectQuery = `
    SELECT * FROM exchange.purchase_orders
    WHERE offer_status = 'Sent'
      AND offer_expires_at IS NOT NULL
      AND offer_expires_at < NOW();
  `;

  try {
    const { rows: expiredOrders } = await pool.query(selectQuery);

    for (const order of expiredOrders) {
      if (order.spots_locked) {
        const newSentAt = new Date();
        const newExpiresAt = new Date(
          newSentAt.getTime() + 7 * 24 * 60 * 60 * 1000
        ); // 1 week

        // 1. Unlock order and update timestamps
        await pool.query(
          `
            UPDATE exchange.purchase_orders
            SET offer_sent_at = $1,
              offer_expires_at = $2,
              spots_locked = false,
              offer_status = 'Sent',
              updated_at = NOW(),
              updated_by = 'Scheduler'
            WHERE id = $3
          `,
          [newSentAt, newExpiresAt, order.id]
        );

        // 2. Reset bid_spot values to NULL
        await pool.query(
          `
            UPDATE exchange.order_metals
            SET bid_spot = NULL
            WHERE purchase_order_id = $1
          `,
          [order.id]
        );
      } else {
        try {
          await autoAcceptOrder(order);
        } catch (err) {
          console.error("[CRON] autoAcceptOrder failed:", err);
        }
      }
    }
  } catch (err) {
    console.error("[CRON] Error processing expired offers:", err);
  }
}

async function autoAcceptOrder(order) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Fetch spot prices
    const { rows: spot_prices } = await client.query(`
      SELECT type, bid_spot
      FROM exchange.metals
    `);

    // 2. Update bid_spot for each metal
    const updatedSpots = await Promise.all(
      spot_prices.map(async (spot) => {
        const result = await client.query(
          `
            UPDATE exchange.order_metals
            SET bid_spot = $1
            WHERE purchase_order_id = $2 AND type = $3
            RETURNING *;
          `,
          [spot.bid_spot, order.id, spot.type]
        );
        return result.rows[0];
      })
    );

    // 3. Fetch fully hydrated order_items
    const { rows: hydratedOrderArray } = await client.query(
      ` SELECT 
        po.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', poi.id,
          'purchase_order_id', poi.purchase_order_id,
          'price', poi.price,
          'quantity', poi.quantity,
          'confirmed', poi.confirmed,
          'bullion_premium', poi.bullion_premium,
          'item_type', CASE 
            WHEN poi.scrap_id IS NOT NULL THEN 'scrap'
            WHEN poi.product_id IS NOT NULL THEN 'product'
            ELSE 'unknown'
          END,
          'scrap', jsonb_build_object(
            'id', s.id,
            'pre_melt', s.pre_melt,
            'post_melt', s.post_melt,
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
      WHERE po.id = $1
      GROUP BY po.id, addr.id, ship.id, cp.id, pay.id, u.id
      ORDER BY po.created_at DESC;
    `,
      [order.id]
    );

    const hydratedOrder = hydratedOrderArray[0];

    // 4. Update each item price
    for (const item of hydratedOrder.order_items) {
      const price = calculateItemPrice(item, updatedSpots);
      await client.query(
        `UPDATE exchange.purchase_order_items
         SET price = $1
         WHERE id = $2 AND purchase_order_id = $3`,
        [price, item.id, order.id]
      );
    }

    // 5. Calculate and save total price
    const total_price = calculateTotalPrice(hydratedOrder, updatedSpots);

    await client.query(
      `UPDATE exchange.purchase_orders
       SET offer_status = 'Accepted',
           purchase_order_status = 'Accepted',
           total_price = $1,
           spots_locked = true,
           updated_at = NOW(),
           updated_by = 'System'
       WHERE id = $2`,
      [total_price, order.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(
      "[CRON] Failed to auto-accept offer for order",
      order.id,
      err
    );
  } finally {
    client.release();
  }
}

module.exports = {
  updateOrderSpot,
  lockOrderSpots,
  resetOrderSpots,
  saveOrderItems,
  resetOrderItem,
  updateOrderScrapItem,
  deleteOrderScrapItem,
  addNewOrderScrapItem,
  updateOrderBullionItem,
  deleteOrderBullionItem,
  addNewOrderBullionItem,
  expireStaleOffers,
  autoAcceptOrder,
};
