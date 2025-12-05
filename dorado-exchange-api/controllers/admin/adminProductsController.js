import { ADMIN_PRODUCT_FIELDS_WITH_ALIAS } from "../../constants/adminConstants.js";
import pool from "../../db.js";

export async function getAllProducts(req, res) {
  try {
    const query = `
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
}

export async function getAllMetals(req, res) {
  try {
    const query = `SELECT * FROM exchange.metals ORDER BY type ASC`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching metals:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getAllSuppliers(req, res) {
  try {
    const query = `SELECT * FROM exchange.suppliers ORDER BY name ASC`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getAllMints(req, res) {
  try {
    const query = `SELECT * FROM exchange.mints ORDER BY name ASC`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching mints:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function getAllTypes(req, res) {
  try {
    const query = `SELECT DISTINCT product_type AS name FROM exchange.products`;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

export async function saveProduct(req, res) {
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
        updated_at = NOW(),
        slug= $17,
        homepage_display = $18,
        legal_tender = $19,
        domestic_tender = $20,
        sell_display = $21,
        is_generic = $22,
        variant_label = $23,
        quantity = $24,
        image_front = $25,
        image_back = $26
      WHERE id = $27
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
      product.slug,
      product.homepage_display,
      product.legal_tender,
      product.domestic_tender,
      product.sell_display,
      product.is_generic,
      product.variant_label,
      product.quantity,
      product.image_front,
      product.image_back,
      product.id,
    ];

    await pool.query(query, values);
    res.status(200).json("Product updated.");
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export async function createProduct(req, res) {
  const { created_by, name } = req.body;

  try {
    const insertQuery = `
      INSERT INTO exchange.products (created_by, updated_by, product_name)
      VALUES ($1, $1, $2)
      RETURNING id
    `;
    const insertResult = await pool.query(insertQuery, [created_by, name]);
    const newProductId = insertResult.rows[0].id;

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
}