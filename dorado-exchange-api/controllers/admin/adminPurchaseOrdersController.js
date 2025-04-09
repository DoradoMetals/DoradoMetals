const pool = require("../../db");

const getAllPurchaseOrders = async (req, res) => {
  try {
    const query = 
    `
      SELECT 
        purchase_order.id AS id, purchase_order.purchase_order_status AS order_status, purchase_order.notes, purchase_order.created_at, purchase_order.updated_at, purchase_order.notes, purchase_order.updated_by, purchase_order.order_number,
        curr_user.id AS user_id, curr_user.name AS username
      FROM exchange.purchase_orders purchase_order
      JOIN exchange.users curr_user ON purchase_order.user_id = curr_user.id
      ORDER BY purchase_order.created_at DESC;
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching scrap:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getAllPurchaseOrders,
};
