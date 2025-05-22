const pool = require("../db");
const { PRODUCT_FIELDS } = require("../constants/productsConstants");

const getAllProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT product.${PRODUCT_FIELDS}, mint.name AS mint_name, metal.type AS metal_type
      FROM exchange.products product
      JOIN exchange.metals metal ON metal.id = product.metal_id
      JOIN exchange.mints mint ON mint.id = product.mint_id
      WHERE product.display = true
    `,
      []
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getHomepageProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT product.${PRODUCT_FIELDS}, mint.name AS mint_name, metal.type AS metal_type
      FROM exchange.products product
      JOIN exchange.metals metal ON metal.id = product.metal_id
      JOIN exchange.mints mint ON mint.id = product.mint_id
      WHERE product.display = true
      AND product.homepage_display = true
    `,
      []
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getFilteredProducts = async (req, res) => {
  const { metal_type, filter_category, product_type } = req.query;

  try {
    let baseQuery = `
      SELECT product.${PRODUCT_FIELDS}, mint.name AS mint_name, metal.type AS metal_type
      FROM exchange.products product
      JOIN exchange.metals metal ON metal.id = product.metal_id
      JOIN exchange.mints mint ON mint.id = product.mint_id
    `;

    const conditions = ["product.display = true"];
    const values = [];

    if (metal_type) {
      values.push(metal_type);
      conditions.push(`metal.type = $${values.length}`);
    }

    if (filter_category) {
      values.push(filter_category);
      conditions.push(`product.filter_category = $${values.length}`);
    }

    if (product_type) {
      values.push(product_type);
      conditions.push(`product.product_type = $${values.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const finalQuery = `${baseQuery} ${whereClause} AND product.display = true ORDER BY product.product_name ASC;`;

    const result = await pool.query(finalQuery, values);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};


module.exports = {
  getAllProducts,
  getHomepageProducts,
  getFilteredProducts,
};
