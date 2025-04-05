const { ADMIN_PRODUCT_FIELDS_WITH_ALIAS } = require("../constants/adminConstants");
const pool = require("../db");

const getAllProducts = async (req, res) => {
  try {
    const query = `
      SELECT ${ADMIN_PRODUCT_FIELDS_WITH_ALIAS}, metal.type AS metal, supplier.name AS supplier, mint.name AS mint
      FROM exchange.products p
      JOIN exchange.metals metal ON metal.id = p.metal_id
      JOIN exchange.suppliers supplier ON supplier.id = p.supplier_id
      JOIN exchange.mints mint ON mint.id = p.mint_id
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getAllMetals = async (req, res) => {
  try {
    const query = `SELECT * FROM exchange.metals ORDER BY type ASC`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching metals:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getAllSuppliers = async (req, res) => {
  try {
    const query = `SELECT * FROM exchange.suppliers ORDER BY name ASC`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getAllMints = async (req, res) => {
  try {
    const query = `SELECT * FROM exchange.mints ORDER BY name ASC`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching mints:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getAllTypes = async (req, res) => {
  try {
    const query = `SELECT DISTINCT product_type AS name FROM exchange.products`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const saveProduct = async (req, res) => {
  const product = req.body.product;
  const user_id = req.body.user_id;

  try {
    const query = 
    `
      INSERT INTO exchange.products (
        metal_id, supplier_id, product_name, product_description, bid_premium,
        ask_premium, product_type, display, content, gross, purity,
        mint_id, variant_group, shadow_offset, stock,
        created_by, updated_by
      )
      VALUES (
        (SELECT id FROM exchange.metals WHERE type = $1),
        (SELECT id FROM exchange.suppliers WHERE name = $2),
        $3, $4, $5, $6, $7, $8, $9, $10,
        $11,
        (SELECT id FROM exchange.mints WHERE name = $12),
        $13, $14, $15,
        $16, $16
      )
      ON CONFLICT (product_name) DO UPDATE SET
        metal_id = (SELECT id FROM exchange.metals WHERE type = $1),
        supplier_id = (SELECT id FROM exchange.suppliers WHERE name = $2),
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
        updated_by = $16;
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
      user_id,
    ];

    await pool.query(query, values);
    res.status(200).json("Created or updated product.");
  } catch (error) {
    console.error("Error creating/updating product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteProduct = async (req, res) => {
  const { product_id } = req.body;

  try {
    const query = `DELETE FROM exchange.products WHERE id = $1`;
    await pool.query(query, [product_id]);
    res.status(200).json("Deleted product.");
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getAllProducts,
  getAllMetals,
  getAllSuppliers,
  getAllMints,
  getAllTypes,
  saveProduct,
  deleteProduct,
};