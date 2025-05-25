const pool = require("../db");
const { PRODUCT_FIELDS } = require("../constants/productsConstants");

const getCart = async (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "Missing user_id" });
  }

  try {
    const query = `
      SELECT 
        ci.id AS cart_item_id, 
        ci.product_id, 
        ci.quantity, 
        p.${PRODUCT_FIELDS}, 
        metal.type AS metal_type, 
        mint.name AS mint_name
      FROM exchange.cart_items ci
      LEFT JOIN exchange.products p ON ci.product_id = p.id
      LEFT JOIN exchange.metals metal ON metal.id = p.metal_id
      LEFT JOIN exchange.mints mint ON mint.id = p.mint_id
      WHERE ci.cart_id = (
        SELECT id FROM exchange.carts WHERE user_id = $1
      );
`;
    const { rows } = await pool.query(query, [user_id]);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const syncCart = async (req, res) => {
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
      INSERT INTO exchange.carts (id, user_id)
      VALUES (gen_random_uuid(), $1)
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
              `SELECT id FROM exchange.carts WHERE user_id = $1`,
              [user_id]
            )
          ).rows[0].id;

    // Clear existing cart items
    await client.query(`DELETE FROM exchange.cart_items WHERE cart_id = $1`, [
      cartId,
    ]);

    // Insert new items
    for (const item of cart) {
      if (!item.product_name) continue;

      const productRes = await client.query(
        `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
        [item.product_name]
      );

      if (productRes.rows.length === 0) continue;

      const productId = productRes.rows[0].id;
      const quantity = item.quantity || 1;

      await client.query(
        `INSERT INTO exchange.cart_items (id, cart_id, product_id, quantity)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [cartId, productId, quantity]
      );
    }

    await client.query("COMMIT");
    res.status(200).json({ message: "Cart synced successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error syncing cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
};

module.exports = {
  getCart,
  syncCart,
};
