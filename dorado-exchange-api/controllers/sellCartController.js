const pool = require("../db");
const { PRODUCT_FIELDS, PRODUCT_FIELDS_WITH_ALIAS } = require("../constants/productsConstants");

const getSellCart = async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    const query = `
  SELECT sci.id AS cart_item_id, sci.product_id, sci.scrap_id, sci.quantity,
         ${PRODUCT_FIELDS_WITH_ALIAS},
        s.gross, s.purity, s.content, metal.type AS metal
  FROM exchange.sell_cart_items sci
  LEFT JOIN exchange.products p ON sci.product_id = p.id
  LEFT JOIN exchange.scrap s ON sci.scrap_id = s.id
  JOIN exchange.metals metal ON metal.id = s.metal_id
  WHERE sci.cart_id = (
    SELECT id FROM exchange.sell_carts WHERE user_id = $1
  );
`;

    const { rows } = await pool.query(query, [user_id]);
    res.status(200).json(rows);
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

        // If no scrap_id provided, insert a new scrap row
        if (!scrapId) {
          const scrapInsert = await client.query(
            `
            INSERT INTO exchange.scrap (metal_id, gem_id, gross, purity, content)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            `,
            [
              item.metal_id,
              item.gem_id || null,
              item.gross || null,
              item.purity || null,
              item.content || null,
            ]
          );

          scrapId = scrapInsert.rows[0].id;
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
