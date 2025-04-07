const {
  ADMIN_PRODUCT_FIELDS_WITH_ALIAS,
} = require("../constants/adminConstants");
const pool = require("../db");

const getAllScrap = async (req, res) => {
  try {
    const query = 
    `
	    SELECT 
        order_item.id AS order_item_id, order_item.price AS price,
        purchase_order.id AS order_id, purchase_order.purchase_order_status AS order_status, purchase_order.created_at, purchase_order.updated_at, purchase_order.notes, purchase_order.updated_by, purchase_order.order_number,
        curr_user.id AS user_id, curr_user.name AS username,
        scrap.id AS scrap_id, scrap.gross, scrap.purity, scrap.content, scrap.gross_unit,
        metal.type AS metal
      FROM exchange.purchase_order_items order_item
      JOIN exchange.purchase_orders purchase_order ON order_item.purchase_order_id = purchase_order.id
      JOIN exchange.users curr_user ON purchase_order.user_id = curr_user.id
      JOIN exchange.scrap scrap ON order_item.scrap_id = scrap.id
      JOIN exchange.metals metal ON scrap.metal_id = metal.id
      ORDER BY purchase_order.created_at DESC;
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching scrap:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const saveProduct = async (req, res) => {
  const product = req.body.product;
  const user = req.body.user;

  try {
    const query = `
      UPDATE exchange.products SET
        metal_id = (SELECT id FROM exchange.metals WHERE type = $1),
        supplier_id = (SELECT id FROM exchange.suppliers WHERE name = $2),
        product_name = $3,
        product_description = $4,
        bid_premium = $5,
        ask_premium = $6,
        product_type = $7,
        display = $8,
        content = $9,
        gross = $10,
        purity = $11,
        mint_id = (SELECT id FROM exchange.mints WHERE name = $12),
        variant_group = $13,
        shadow_offset = $14,
        stock = $15,
        updated_by = $16,
        updated_at = NOW()
      WHERE id = $17
    `;

    const values = [
      product.metal,
      product.supplier,
      product.product_name,
      product.product_description,
      product.bid_premium,
      product.ask_premium,
      product.product_type,
      product.display,
      product.content,
      product.gross,
      product.purity,
      product.mint,
      product.variant_group,
      product.shadow_offset,
      product.stock,
      user.name,
      product.id, // used in WHERE clause
    ];

    await pool.query(query, values);
    res.status(200).json("Product updated.");
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteProduct = async (req, res) => {
  const product = req.body.product;

  try {
    const query = `DELETE FROM exchange.products WHERE id = $1`;
    await pool.query(query, [product.id]);
    res.status(200).json("Deleted product.");
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAllScrap,
  saveProduct,
  deleteProduct,
};
