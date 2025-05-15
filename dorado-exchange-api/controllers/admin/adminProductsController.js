const {
  ADMIN_PRODUCT_FIELDS_WITH_ALIAS,
} = require("../../constants/adminConstants");
const pool = require("../../db");

const getAllProducts = async (req, res) => {
  try {
    const query = 
    `
      SELECT ${ADMIN_PRODUCT_FIELDS_WITH_ALIAS}, metal.type AS metal, supplier.name AS supplier, mint.name AS mint
      FROM exchange.products p
      JOIN exchange.metals metal ON metal.id = p.metal_id
      JOIN exchange.suppliers supplier ON supplier.id = p.supplier_id
      JOIN exchange.mints mint ON mint.id = p.mint_id
      ORDER BY product_name ASC
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

const createProduct = async (req, res) => {
  const { created_by } = req.body;

  try {
    // Step 1: Insert new product and get its ID
    const insertQuery = `
      INSERT INTO exchange.products (created_by, updated_by)
      VALUES ($1, $1)
      RETURNING id
    `;
    const insertResult = await pool.query(insertQuery, [created_by]);
    const newProductId = insertResult.rows[0].id;

    // Step 2: Query full product details with joins
    const selectQuery = `
      SELECT 
        ${ADMIN_PRODUCT_FIELDS_WITH_ALIAS}, 
        metal.type AS metal, 
        supplier.name AS supplier, 
        mint.name AS mint
      FROM exchange.products p
      JOIN exchange.metals metal ON metal.id = p.metal_id
      JOIN exchange.suppliers supplier ON supplier.id = p.supplier_id
      JOIN exchange.mints mint ON mint.id = p.mint_id
      WHERE p.id = $1
    `;
    const fullResult = await pool.query(selectQuery, [newProductId]);

    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    console.error("Error creating product:", error);
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

const getInventory = async (req, res) => {
  try {
    const query = `
      SELECT
        p.id,
        p.product_name,
        p.bid_premium,
        p.ask_premium,
        p.product_type,
        p.content,
        p.quantity,
        m.type AS metal
      FROM exchange.products p
      JOIN exchange.metals m ON m.id = p.metal_id
      WHERE p.quantity > 0
    `;

    const result = await pool.query(query);
    const rows = result.rows;

    const metalTypes = ['Gold', 'Silver', 'Platinum', 'Palladium'];
    const inventory = {};

    // Initialize all 4 metal categories
    for (const metal of metalTypes) {
      inventory[metal] = {
        total_content: 0,
        coins: 0,
        bars: 0,
        other: 0,
        inventory_list: []
      };
    }

    for (const product of rows) {
      const {
        id,
        product_name,
        bid_premium,
        ask_premium,
        product_type,
        content,
        quantity,
        metal
      } = product;

      if (!inventory[metal]) continue; // skip unrecognized metals

      const group = inventory[metal];

      group.total_content += (content || 0) * (quantity || 0);

      if (product_type === 'Coin') {
        group.coins += quantity;
      } else if (product_type === 'Bar') {
        group.bars += quantity;
      } else {
        group.other += quantity;
      }

      group.inventory_list.push({
        id,
        product_name,
        bid_premium,
        ask_premium,
        product_type,
        content,
        quantity
      });
    }
    res.status(200).json(inventory);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  getAllProducts,
  getAllMetals,
  getAllSuppliers,
  getAllMints,
  getAllTypes,
  saveProduct,
  createProduct,
  deleteProduct,
  getInventory,
};
