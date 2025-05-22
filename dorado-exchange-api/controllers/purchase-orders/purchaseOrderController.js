const pool = require("../../db");
const {
  calculateItemPrice,
  calculateTotalPrice,
} = require("../../utils/price-calculations");
const {
  createFedexLabel,
  scheduleFedexPickup,
  formatAddressForFedEx,
} = require("../shipping/fedexController");

const getPurchaseOrders = async (req, res) => {
  const { user_id } = req.query;

  try {
    const query = `
      SELECT 
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
        to_jsonb(pay) AS payout
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
      WHERE po.user_id = $1
      GROUP BY po.id, addr.id, ship.id, cp.id, pay.id
      ORDER BY po.created_at DESC;
    `;

    const values = [user_id];
    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getPurchaseOrderMetals = async (req, res) => {
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

const acceptOffer = async (req, res) => {
  const { order, order_spots, spot_prices } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let updatedSpots = order_spots;

    // 1. Lock and update order spot prices if not already locked
    if (!order.spots_locked) {
      const updates = await Promise.all(
        spot_prices.map(async (spot) => {
          const query = `
            UPDATE exchange.order_metals
            SET bid_spot = $1, scrap_percentage = $2
            WHERE purchase_order_id = $3 AND type = $4
            RETURNING *;
          `;
          const values = [
            spot.bid_spot,
            spot.scrap_percentage,
            order.id,
            spot.type,
          ];
          const result = await client.query(query, values);
          return result.rows[0];
        })
      );
      updatedSpots = updates;
    }

    // 2. Lock and insert prices for all order items
    await Promise.all(
      order.order_items.map(async (item) => {
        const price = calculateItemPrice(item, updatedSpots);
        const query = `
          UPDATE exchange.purchase_order_items
          SET price = $1
          WHERE id = $2 AND purchase_order_id = $3
        `;
        const values = [price, item.id, order.id];
        await client.query(query, values);
      })
    );

    // 3. Lock and insert total order price
    const total_price = calculateTotalPrice(order, updatedSpots);
    const updateOrderQuery = `
      UPDATE exchange.purchase_orders
      SET 
        offer_status = $1,
        purchase_order_status = $2,
        total_price = $3,
        spots_locked = true
      WHERE id = $4
    `;
    const updateOrderValues = ["Accepted", "Accepted", total_price, order.id];
    await client.query(updateOrderQuery, updateOrderValues);

    await client.query("COMMIT");

    const finalQuery = `SELECT * FROM exchange.purchase_orders WHERE id = $1`;
    const { rows } = await client.query(finalQuery, [order.id]);

    res.status(200).json(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error accepting offer:", error);
    res.status(500).json({ error: "Failed to accept offer." });
  } finally {
    client.release();
  }
};

const rejectOffer = async (req, res) => {
  const { order, offer_notes } = req.body;

  const num_rejections = order.num_rejections + 1;

  try {
    const query = `
      UPDATE exchange.purchase_orders
      SET
        purchase_order_status = $1,
        offer_status = $2,
        offer_notes = $3,
        num_rejections = $4
      WHERE id = $5
      RETURNING *;
    `;
    const values = [
      "Rejected",
      "Rejected",
      offer_notes,
      num_rejections,
      order.id,
    ];
    const { rows } = await pool.query(query, values);

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error rejecting offer:", error);
    res.status(500).json({ error: "Failed to reject offer." });
  }
};

const cancelOrder = async (req, res) => {
  const { order } = req.body;

  try {
    const query = `
      UPDATE exchange.purchase_orders
      SET
        purchase_order_status = $1,
        offer_status = $2
      WHERE id = $3
      RETURNING *;
    `;
    const values = ["Cancelled", "Cancelled", order.id];
    const { rows } = await pool.query(query, values);

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: "Failed to cancel order." });
  }
};

const updateOfferNotes = async (req, res) => {
  const { order, offer_notes } = req.body;

  try {
    const query = `
      UPDATE exchange.purchase_orders
      SET
        offer_notes = $1
      WHERE id = $2
      RETURNING *;
    `;
    const values = [offer_notes, order.id];
    const { rows } = await pool.query(query, values);

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error updating offer notes:", error);
    res.status(500).json({ error: "Failed to update offer notes." });
  }
};

const createPurchaseOrder = async (req, res) => {
  const { purchase_order, user_id } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Step 1: Insert purchase order
    const insertOrderQuery = `
      INSERT INTO exchange.purchase_orders (user_id, address_id, purchase_order_status)
      VALUES ($1, $2, $3)
      RETURNING id;
    `;
    const orderValues = [user_id, purchase_order.address.id, "In Transit"];
    const { rows } = await client.query(insertOrderQuery, orderValues);
    const purchase_order_id = rows[0].id;

    // Step 2: Insert order items
    const insertItemQuery = `
      INSERT INTO exchange.purchase_order_items (purchase_order_id, scrap_id, product_id, quantity, bullion_premium)
      VALUES ($1, $2, $3, $4, $5)
    `;
    for (const item of purchase_order.items) {
      const { type, data } = item;
      const scrap_id = type === "scrap" ? data.id : null;
      const product_id = type === "product" ? data.id : null;
      const bid_premium = type === "product" ? data.bid_premium : null;

      await client.query(insertItemQuery, [
        purchase_order_id,
        scrap_id,
        product_id,
        data.quantity,
        bid_premium,
      ]);
    }

    // Step 3: Generate FedEx label
    const labelData = await createFedexLabel(
      purchase_order.address.name,
      purchase_order.address.phone_number,
      formatAddressForFedEx(purchase_order.address),
      "Inbound",
      {
        weight: purchase_order.package.weight,
        dimensions: purchase_order.package.dimensions,
        insured: purchase_order.insurance.insured,
      },
      purchase_order.pickup?.label || "DROPOFF_AT_FEDEX_LOCATION",
      purchase_order.service?.serviceType || "FEDEX_GROUND",
      purchase_order.insurance.declaredValue
    );

    const trackingNumber = labelData.tracking_number;
    const labelFileBase64 = labelData.labelFile;
    const labelBuffer = Buffer.from(labelFileBase64, "base64");

    const shipping_status =
      purchase_order.pickup.name === "Carrier Pickup"
        ? "Waiting for Pickup"
        : "Waiting for Dropoff";

    await client.query(
      `
      INSERT INTO exchange.inbound_shipments (
        order_id,
        tracking_number,
        carrier,
        shipping_status,
        shipping_label,
        label_type,
        pickup_type,
        package,
        service_type,
        net_charge,
        insured,
        declared_value
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
      [
        purchase_order_id,
        trackingNumber,
        "FedEx",
        shipping_status,
        labelBuffer,
        "Generated",
        purchase_order.pickup?.name || "Unknown",
        purchase_order.package.label,
        purchase_order.service.serviceDescription,
        purchase_order.service.netCharge,
        purchase_order.insurance.insured,
        purchase_order.insurance.declaredValue.amount,
      ]
    );

    // Step 4: Schedule Pickup (if needed)
    if (purchase_order.pickup?.name === "Carrier Pickup") {
      const { confirmationNumber, location } = await scheduleFedexPickup(
        purchase_order.address.name,
        purchase_order.address.phone_number,
        formatAddressForFedEx(purchase_order.address),
        purchase_order.pickup.date,
        purchase_order.pickup.time,
        purchase_order.service.code,
        trackingNumber
      );

      await client.query(
        `
        INSERT INTO exchange.carrier_pickups (
          user_id,
          order_id,
          carrier,
          pickup_requested_at,
          pickup_status,
          confirmation_number,
          location
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          user_id,
          purchase_order_id,
          "FedEx",
          new Date(
            `${purchase_order.pickup.date}T${purchase_order.pickup.time}Z`
          ).toISOString(),
          "scheduled",
          confirmationNumber,
          location,
        ]
      );
    }

    // Step 5: Create payout
    await client.query(
      `
      INSERT INTO exchange.payouts (
        user_id, order_id, method, account_holder_name, bank_name, account_type, routing_number, account_number, email_to
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        user_id,
        purchase_order_id,
        purchase_order.payout.method,
        purchase_order.payout.account_holder_name,
        purchase_order.payout.bank_name || null,
        purchase_order.payout.account_type || null,
        purchase_order.payout.routing_number || null,
        purchase_order.payout.account_number || null,
        purchase_order.payout.payout_email || null,
      ]
    );

    // Step 6: Create order metals
    const metals = ["Gold", "Silver", "Platinum", "Palladium"];
    for (const metal of metals) {
      await client.query(
        `
        INSERT INTO exchange.order_metals (
          purchase_order_id, type
        )
        VALUES ($1, $2)
      `,
        [purchase_order_id, metal]
      );
    }

    await client.query("COMMIT");

    return res.status(200).json({ success: true, purchase_order_id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating purchase order:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
};

module.exports = {
  getPurchaseOrders,
  getPurchaseOrderMetals,
  createPurchaseOrder,
  acceptOffer,
  rejectOffer,
  updateOfferNotes,
  cancelOrder,
};
