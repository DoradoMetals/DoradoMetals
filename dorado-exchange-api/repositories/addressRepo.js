const pool = require("../db")

async function getAddressFromId(id) {
  const query = `
  SELECT *
  FROM exchange.addresses
  WHERE id = $1
  `
  const values = [id]
  const result = await pool.query(query, values)
  return result.rows[0]
}

module.exports = {
  getAddressFromId,
}