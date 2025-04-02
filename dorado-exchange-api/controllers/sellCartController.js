const pool = require("../db");
const {
  PRODUCT_FIELDS,
  PRODUCT_FIELDS_WITH_ALIAS,
} = require("../constants/productsConstants");

const getSellCart = async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    // Get cart ID
    const cartResult = await pool.query(
      `SELECT id FROM exchange.sell_carts WHERE user_id = $1`,
      [user_id]
    );

    if (cartResult.rows.length === 0) {
      return res.status(200).json([]); // No cart, return empty array
    }

    const cartId = cartResult.rows[0].id;

    // Fetch scrap items
    const scrapQuery = `
      SELECT sci.id AS cart_item_id, sci.scrap_id, sci.quantity,
             s.*, metal.type AS metal
      FROM exchange.sell_cart_items sci
      LEFT JOIN exchange.scrap s ON sci.scrap_id = s.id
      LEFT JOIN exchange.metals metal ON metal.id = s.metal_id
      WHERE sci.cart_id = $1 AND sci.scrap_id IS NOT NULL
    `;
    const scrapResult = await pool.query(scrapQuery, [cartId]);

    const scrapItems = scrapResult.rows.map((row) => ({
      type: 'scrap',
      data: {
        ...row,
        gross: Number(row.gross),
        purity: Number(row.purity),
        content: Number(row.content),
        quantity: row.quantity,
      },
    }))

    // Fetch product items
    const productQuery = `
      SELECT sci.id AS cart_item_id, sci.product_id, sci.quantity,
             ${PRODUCT_FIELDS_WITH_ALIAS}, metal.type AS metal_type
      FROM exchange.sell_cart_items sci
      LEFT JOIN exchange.products p ON sci.product_id = p.id
      LEFT JOIN exchange.metals metal ON metal.id = p.metal_id
      WHERE sci.cart_id = $1 AND sci.product_id IS NOT NULL
    `;
    const productResult = await pool.query(productQuery, [cartId]);

    const productItems = productResult.rows.map((row) => ({
      type: "product",
      data: {
        ...row,
        quantity: row.quantity,
      },
    }));

    const combined = [...scrapItems, ...productItems];

    res.status(200).json(combined);
  } catch (error) {
    console.error("Error fetching sell cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const syncSellCart = async (req, res) => {
  const { user_id, cart } = req.body;

  if (!user_id || !Array.isArray(cart)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Create cart if it doesn't exist
    const cartResult = await client.query(
      `
      INSERT INTO exchange.sell_carts (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING id
      `,
      [user_id]
    );

    const cartId =
      cartResult.rows.length > 0
        ? cartResult.rows[0].id
        : (
            await client.query(
              `SELECT id FROM exchange.sell_carts WHERE user_id = $1`,
              [user_id]
            )
          ).rows[0].id;

    // Clear existing items
    await client.query(
      `DELETE FROM exchange.sell_cart_items WHERE cart_id = $1`,
      [cartId]
    );

    // Insert each cart item
    for (const item of cart) {
      const quantity = item.quantity || 1;

      // Handle product
      if (item.type === "product" && item.product_name) {
        const productRes = await client.query(
          `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
          [item.product_name]
        );

        if (productRes.rows.length === 0) continue;

        const productId = productRes.rows[0].id;

        await client.query(
          `INSERT INTO exchange.sell_cart_items (cart_id, product_id, quantity)
           VALUES ($1, $2, $3)`,
          [cartId, productId, quantity]
        );
      }

      // Handle scrap
      if (item.type === "scrap") {
        let scrapId = item.scrap_id;
        if (!scrapId) {
          try {
            const scrapInsert = await client.query(
              `
              INSERT INTO exchange.scrap (
                metal_id,
                gem_id,
                gross,
                purity,
                content,
                gross_unit
              )
              VALUES (
                (SELECT id FROM exchange.metals WHERE LOWER(type) = LOWER($1)),
                $2, $3, $4, $5, $6
              )
              RETURNING id
              `,
              [
                item.data.metal,
                item.data.gem_id,
                item.data.gross,
                item.data.purity,
                item.data.content,
                item.data.gross_unit
              ]
            );

            scrapId = scrapInsert.rows[0].id;
          } catch (err) {
            console.error("Scrap insert failed:", err);
            continue; // skip to next item
          }
        }

        await client.query(
          `INSERT INTO exchange.sell_cart_items (cart_id, scrap_id, quantity)
           VALUES ($1, $2, $3)`,
          [cartId, scrapId, quantity]
        );
      }
    }

    await client.query("COMMIT");
    res.status(200).json({ message: "Sell cart synced successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error syncing sell cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
};

module.exports = {
  getSellCart,
  syncSellCart,
};
