const { default: axios } = require("axios");
const pool = require("../../db");
const { createFedexLabel, scheduleFedexPickup, formatAddressForFedEx } = require("../shipping/fedexController");

const getPurchaseOrders = async (req, res) => {
  const { user_id } = req.query;

  try {
    const query = `
      SELECT * FROM exchange.purchase_orders WHERE user_id = $1 ORDER BY created_at ASC;
    `;
    const values = [user_id];

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const createPurchaseOrder = async (req, res) => {
  const { purchase_order, user_id } = req.body;
  const client = await pool.connect();
  let purchase_order_id;

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
    purchase_order_id = rows[0].id;

    // Step 2: Insert items
    const insertItemQuery = `
      INSERT INTO exchange.purchase_order_items (purchase_order_id, scrap_id, product_id)
      VALUES ($1, $2, $3)
    `;
    for (const item of purchase_order.items) {
      const { type, data } = item;
      const scrap_id = type === "scrap" ? data.id : null;
      const product_id = type === "product" ? data.id : null;

      await client.query(insertItemQuery, [
        purchase_order_id,
        scrap_id,
        product_id,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating purchase order:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }

  // Step 3: Generate FedEx label (non-transactional)
  let trackingNumber = null;
  let labelFileBase64 = null;

  try {
    const labelData = await createFedexLabel(
      purchase_order.address.name,
      purchase_order.address.phone_number,
      formatAddressForFedEx(purchase_order.address),
      "Inbound",
      {
        weight: purchase_order.package.weight,
        dimensions: purchase_order.package.dimensions,
        insured: purchase_order.insured,
      },
      purchase_order.pickup?.label || "DROPOFF_AT_FEDEX_LOCATION",
      purchase_order.service?.serviceType || "FEDEX_GROUND"
    );

    trackingNumber = labelData.tracking_number;
    labelFileBase64 = labelData.labelFile;

    if (trackingNumber && labelFileBase64) {
      const labelBuffer = Buffer.from(labelFileBase64, "base64");

      await pool.query(
        `
      INSERT INTO exchange.inbound_shipments (
        order_id,
        tracking_number,
        carrier,
        shipping_status,
        created_at,
        shipping_label,
        label_type,
        pickup_type
      )
      VALUES ($1, $2, $3, 'label_created', NOW(), $4, $5, $6)
    `,
        [
          purchase_order_id,
          trackingNumber,
          "FedEx",
          labelBuffer,
          "Generated",
          purchase_order.pickup?.name || "Unknown",
        ]
      );
    }
  } catch (labelError) {
    console.error("Label generation or insert failed:", labelError);
  }

    // Step 4: Schedule pickup (and insert confirmation record)
    if (purchase_order.pickup?.name === "Carrier Pickup") {
      try {
        const { confirmationNumber } = await scheduleFedexPickup(
          purchase_order.address.name,
          purchase_order.address.phone_number,
          formatAddressForFedEx(purchase_order.address),
          purchase_order.pickup.date,
          purchase_order.pickup.time,
          purchase_order.service.code,
          trackingNumber
        );
  
        if (confirmationNumber) {
          await pool.query(
            `
            INSERT INTO exchange.carrier_pickups (
              user_id,
              order_id,
              carrier,
              pickup_requested_at,
              pickup_status,
              confirmation_number
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
            [
              user_id,
              purchase_order_id,
              "FedEx",
              new Date(`${purchase_order.pickup.date}T${purchase_order.pickup.time}Z`).toISOString(),
              'scheduled',
              confirmationNumber,
            ]
          );
        }
      } catch (pickupError) {
        console.error("Pickup scheduling failed:", pickupError);
      }
    }

  // Step 5: Create payout record
  try {
    await pool.query(
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
        purchase_order.payout.payout_email || null
      ]
    );
  } catch (payoutError) {
    console.error("Payout creation failed:", payoutError);
  }

  return res.status(200).json({ success: true, purchase_order_id });
};

module.exports = {
  getPurchaseOrders,
  createPurchaseOrder,
};
