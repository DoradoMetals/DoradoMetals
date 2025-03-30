const pool = require("../db"); // Database connection
const { PRODUCT_FIELDS } = require('../constants/productsConstants');

const getCart = async (req, res) => {
  const { user_id } = req.query;

  try {
    const query = `
      SELECT ci.id AS cart_item_id, ci.product_id, ci.scrap_id, ci.quantity, p.${PRODUCT_FIELDS}
      FROM exchange.cart_items ci
      LEFT JOIN exchange.products p ON ci.product_id = p.id
      WHERE ci.cart_id = (SELECT id FROM exchange.carts WHERE user_id = $1);
    `;
    const values = [user_id];

    const { rows } = await pool.query(query, values);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const syncCart = async (req, res) => {
  const { user_id, cart } = req.body;

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `DELETE FROM exchange.cart_items WHERE cart_id = (SELECT id FROM exchange.carts WHERE user_id = $1)`,
        [user_id]
      );

      if (cart.length > 0) {
        const cartResult = await client.query(
          `INSERT INTO exchange.carts (id, user_id)
           VALUES (gen_random_uuid(), $1)
           ON CONFLICT (user_id) DO NOTHING
           RETURNING id`,
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

        for (const item of cart) {
          const productRes = await client.query(
            `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
            [item.product_name]
          );
          if (productRes.rows.length === 0) continue;

          const productId = productRes.rows[0].id;

          await client.query(
            `INSERT INTO exchange.cart_items (id, cart_id, product_id, quantity)
             VALUES (gen_random_uuid(), $1, $2, $3)`,
            [cartId, productId, item.quantity || 1]
          );
        }
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
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ error: "Database Error" });
  }
};

const addToCart = async (req, res) => {
  const user_id = req.body.user_id;
  const product_name = req.body.product.product_name;

  console.log(product_name);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productRes = await client.query(
      `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
      [product_name]
    );

    if (productRes.rows.length === 0) throw new Error("Product not found");
    const product_id = productRes.rows[0].id;

    await client.query(
      `INSERT INTO exchange.carts (id, user_id)
       VALUES (gen_random_uuid(), $1)
       ON CONFLICT (user_id) DO NOTHING;`,
      [user_id]
    );

    const cartRes = await client.query(
      `SELECT id FROM exchange.carts WHERE user_id = $1 LIMIT 1`,
      [user_id]
    );
    const cart_id = cartRes.rows[0]?.id;
    if (!cart_id) throw new Error("Cart not found");

    await client.query(
      `
        INSERT INTO exchange.cart_items (id, cart_id, product_id, quantity)
        VALUES (gen_random_uuid(), $1, $2, 1)
        ON CONFLICT (cart_id, product_id)
        DO UPDATE SET quantity = COALESCE(exchange.cart_items.quantity, 0) + 1;
      `,
      [cart_id, product_id]
    );

    await client.query("COMMIT");
    res.status(200).json({ message: "Item added to cart" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error adding to cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
};

const removeFromCart = async (req, res) => {
  const { user_id, product } = req.body;
  const product_name = product.product_name;

  try {
    const productRes = await pool.query(
      `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
      [product_name]
    );
    if (productRes.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });
    const product_id = productRes.rows[0].id;

    const selectQuery = `
      SELECT id, quantity
      FROM exchange.cart_items
      WHERE cart_id = (SELECT id FROM exchange.carts WHERE user_id = $1)
      AND product_id = $2
      LIMIT 1;
    `;
    const { rows } = await pool.query(selectQuery, [user_id, product_id]);
    const item = rows[0];

    if (!item) return res.status(404).json({ error: "Item not found in cart" });

    if (item.quantity > 1) {
      await pool.query(
        `
        UPDATE exchange.cart_items
        SET quantity = quantity - 1
        WHERE id = $1;
      `,
        [item.id]
      );
    } else {
      await pool.query(
        `
        DELETE FROM exchange.cart_items
        WHERE id = $1;
      `,
        [item.id]
      );
    }

    res.status(200).json({ message: "Item removed from cart" });
  } catch (error) {
    console.error("Error removing from cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const removeItemFromCart = async (req, res) => {
  const { user_id, product_name } = req.body;

  try {
    const productRes = await pool.query(
      `SELECT id FROM exchange.products WHERE product_name = $1 LIMIT 1`,
      [product_name]
    );

    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product_id = productRes.rows[0].id;

    await pool.query(
      `
      DELETE FROM exchange.cart_items
      WHERE cart_id = (SELECT id FROM exchange.carts WHERE user_id = $1)
      AND product_id = $2;
      `,
      [user_id, product_id]
    );

    res.status(200).json({ message: "Item fully removed from cart" });
  } catch (error) {
    console.error("Error fully removing item from cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const clearCart = async (req, res) => {
  const user_id = req.body.user_id;

  try {
    await pool.query(
      `
      DELETE FROM exchange.cart_items
      WHERE cart_id = (SELECT id FROM exchange.carts WHERE user_id = $1);
    `,
      [user_id]
    );

    res.status(200).json({ message: "Cleared cart" });
  } catch (error) {
    console.error("Error clearing cart", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getCart,
  syncCart,
  addToCart,
  removeFromCart,
  removeItemFromCart,
  clearCart,
};
