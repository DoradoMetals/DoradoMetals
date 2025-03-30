const pool = require("../db");
const { PRODUCT_FIELDS } = require('../constants/productsConstants');


const getFilteredProducts = async (req, res) => {
  const { metal_type, mint_type, product_type } = req.query;

  try {
    let baseQuery = `
      SELECT product.${PRODUCT_FIELDS}, mint.name AS mint_name
      FROM exchange.products product
      JOIN exchange.metals metal ON metal.id = product.metal_id
      JOIN exchange.mints mint ON mint.id = product.mint_id
    `;

    const conditions = ['product.display = true'];
    const values = [];

    if (metal_type) {
      values.push(metal_type);
      conditions.push(`metal.type = $${values.length}`);
    }

    if (mint_type) {
      values.push(mint_type);
      conditions.push(`mint.type = $${values.length}`);
    }

    if (product_type) {
      values.push(product_type);
      conditions.push(`product.product_type = $${values.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const finalQuery = `${baseQuery} ${whereClause} ORDER BY product.product_name ASC;`;

    const result = await pool.query(finalQuery, values);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching filtered products:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};


const getProductFilters = async (req, res) => {
  try {
    const metalQuery = `
      SELECT DISTINCT m.type AS metal
      FROM exchange.products p
      JOIN exchange.metals m ON p.metal_id = m.id
      WHERE p.display = true;
    `;

    const typeQuery = `
      SELECT DISTINCT product_type AS type
      FROM exchange.products
      WHERE display = true;
    `;

    const mintQuery = `
      SELECT DISTINCT m.type AS mint_type
      FROM exchange.products p
      JOIN exchange.mints m ON p.mint_id = m.id
      WHERE p.display = true;
    `;

    const [metalsResult, typesResult, mintsResult] = await Promise.all([
      pool.query(metalQuery),
      pool.query(typeQuery),
      pool.query(mintQuery),
    ]);

    const metals = metalsResult.rows.map(row => row.metal);
    const types = typesResult.rows.map(row => row.type);
    const mints = mintsResult.rows.map(row => row.mint_type);

    return res.status(200).json({ metals, types, mints });
  } catch (error) {
    console.error('Error fetching product filters:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getFilteredProducts,
  getProductFilters,
};
