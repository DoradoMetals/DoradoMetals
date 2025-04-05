const { ADMIN_PRODUCT_FIELDS_WITH_ALIAS } = require("../constants/adminConstants");
const pool = require("../db");

// Get all products
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

module.exports = {
  getAllProducts,
  getAllMetals,
  getAllSuppliers,
  getAllMints,
  getAllTypes,
};