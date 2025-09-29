import pool from "../../db.js";

export async function getAllScrap(req, res) {
  try {
    const query = `
	    SELECT 
        order_item.id AS order_item_id, order_item.price AS price,
        purchase_order.id AS order_id, purchase_order.purchase_order_status AS order_status, purchase_order.created_at, purchase_order.updated_at, purchase_order.notes, purchase_order.updated_by, purchase_order.order_number,
        curr_user.id AS user_id, curr_user.name AS username,
        scrap.id AS scrap_id, scrap.pre_melt, scrap.purity, scrap.content, scrap.gross_unit,
        metal.type AS metal, scrap.bid_premium
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
}
