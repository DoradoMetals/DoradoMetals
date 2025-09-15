import pool from '../db.js';

export async function getSalesTax(state, item, item_price, item_total) {
  const hasNexus = await isNexus(state);
  const collectingNexus = process.env.COLLECTING_NEXUS_TAXES === 'true' ? true : false;

  if (collectingNexus && !hasNexus) {
    return Number(0);
  }

  const query = `
    SELECT
      COALESCE(
        (
          SELECT r.tax_rate
          FROM exchange.sales_tax_rules AS r
          WHERE r.state_code = $1
            AND r.metal_category IN ($2, 'All')
            AND r.product_type   IN ($3, 'All')
            AND $4 BETWEEN r.min_price    AND r.max_price
            AND $5 BETWEEN r.purity_min   AND r.purity_max
            AND $6 BETWEEN r.aggregate_min AND r.aggregate_max
            AND (r.is_domestic IS NULL OR r.is_domestic = $7)
            AND (r.is_legal_tender IS NULL OR r.is_legal_tender = $8)
            AND $9 BETWEEN r.weight_min  AND r.weight_max
          ORDER BY
            (r.metal_category   <> 'All')   DESC,
            (r.product_type     <> 'All')   DESC,
            (r.is_domestic      IS NOT NULL) DESC,
            (r.is_legal_tender  IS NOT NULL) DESC,
            ((r.min_price  <> 0) OR (r.max_price <> 1e12)) DESC,
            ((r.purity_min <> 0) OR (r.purity_max <> 1))    DESC,
            ((r.aggregate_min <> 0) OR (r.aggregate_max <> 1e12)) DESC
          LIMIT 1
        ),
        0
      ) AS tax_rate;
  `;

  const values = [
    state,
    item.metal_type,
    item.product_type,
    item_price,
    item.purity,
    item_total,
    item.domestic_tender,
    item.legal_tender,
    item.gross,
  ];

  const result = await pool.query(query, values);
  return Number(result.rows[0].tax_rate);
}

export async function updateStateSalesTax(amount, state, client) {
  const query = `
    UPDATE exchange.state_sales_tax
    SET amount_owed = amount_owed + $1
    WHERE state = $2
    AND reached_nexus = true
  `;
  const values = [amount, state];
  await client.query(query, values);
}

export async function isNexus(state) {
  const query = `
    SELECT reached_nexus
    FROM exchange.state_sales_tax
    WHERE state = $1
  `;
  const values = [state];
  const result = await pool.query(query, values);
  return result?.rows[0]?.reached_nexus;
}
