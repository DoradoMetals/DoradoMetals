const pool = require("../db");
const { convertTroyOz } = require("../utils/convertWeights");

async function updateScrapItem({ item }) {
  const content =
    convertTroyOz(
      item.scrap.post_melt ?? item.scrap.pre_melt,
      item.scrap.gross_unit
    ) * item.scrap.purity ?? item.scrap.content;

  const query = `
    UPDATE exchange.scrap
    SET content = $1, purity = $2, pre_melt = $3, post_melt = $4
    WHERE id = $5
    RETURNING *;
  `;

  const values = [
    content,
    item.scrap.purity,
    item.scrap.pre_melt,
    item.scrap.post_melt,
    item.scrap.id,
  ];
  return await pool.query(query, values);
}

async function deleteItems(ids) {
  const query = `
    DELETE FROM exchange.scrap
    WHERE id = ANY($1::uuid[]);
  `;
  const values = [ids];
  return await pool.query(query, values);
}

async function createNewItem(item, client) {
  const metalQuery = `
    SELECT id FROM exchange.metals
    WHERE type = $1
    LIMIT 1
  `;
  const metalResult = await client.query(metalQuery, [item.metal]);

  const metal_id = metalResult.rows[0].id;

  const scrapQuery = `
      INSERT INTO exchange.scrap (
        metal_id, pre_melt, purity, content, gross_unit
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
  const scrapValues = [
    metal_id,
    item.pre_melt ?? 1,
    item.purity ?? 1,
    item.content ?? (item.pre_melt ?? 1) * (item.purity ?? 1),
    item.gross_unit ?? "t oz",
  ];
  const scrapResult = await client.query(scrapQuery, scrapValues);
  return scrapResult.rows[0].id;
}

module.exports = {
  updateScrapItem,
  deleteItems,
  createNewItem,
};
