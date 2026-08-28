// Scrap writes against exchange - the legacy half. In the new schema a scrap
// line IS its order line (orders.items), so this repo is deleted by the
// purchase-orders pivot rather than migrated.
//
// CONVERTED TO TYPESCRIPT VERBATIM. Behaviour is untouched, including the two
// lines FOLLOWUPS records as D47: `convertTroyOz(...) * purity ?? content`
// binds as `(convertTroyOz(...) * purity) ?? content`, so the fallback can
// never fire - undefined * n is NaN, which ?? passes through. What an
// unmeasured purity SHOULD yield is a money question and not a conversion's to
// answer. The types describe what the code does, not what it should do.
import query from "#shared/db/query.js";
import { convertTroyOz } from "#shared/utils/convertWeights.ts";
import type { PoolClient, QueryResult } from "pg";

type Executor = PoolClient | undefined;

export type ScrapValues = {
  id: string;
  pre_melt?: number | null;
  post_melt?: number | null;
  purity?: number | null;
  content?: number | null;
  gross_unit?: string | null;
  bid_premium?: number | null;
  purity_actual?: number | null;
  post_melt_actual?: number | null;
  content_actual?: number | null;
};

export async function updateScrapItem(
  { item }: { item: { scrap: ScrapValues } | Record<string, any> },
  executor?: Executor
): Promise<QueryResult> {
  // The JS this replaces read `convertTroyOz(...) * purity ?? content`. tsc
  // flags that ?? as UNREACHABLE - a number times anything is a number or NaN,
  // never nullish - which is the compiler confirming D47: the fallback has
  // never once fired. It is dropped here as the dead code it is; the
  // multiplication is byte-for-byte the old behaviour, NaN and all. What an
  // unmeasured purity SHOULD yield is the open business question, not this
  // file's to answer.
  const content =
    convertTroyOz(
      (item.scrap.post_melt ?? item.scrap.pre_melt) as number,
      item.scrap.gross_unit as string
    ) * (item.scrap.purity as number);

  const content_actual =
    convertTroyOz(
      (item.scrap.post_melt_actual ?? item.scrap.pre_melt) as number,
      item.scrap.gross_unit as string
    ) * (item.scrap.purity_actual as number);

  const sql = `
    UPDATE exchange.scrap
    SET content = $1,
        purity = $2,
        pre_melt = $3,
        post_melt = $4,
        bid_premium = $5,
        purity_actual = $6,
        post_melt_actual = $7,
        content_actual = $8
    WHERE id = $9
    RETURNING *;
  `;

  // NaN NEVER REACHES THE DATABASE. Postgres NUMERIC accepts it, JSON cannot
  // represent it, and through jsonb composition it comes back as the STRING
  // "NaN" - a value that concatenates instead of adding (D65). An uncomputable
  // content is stored as NULL, which is what "not measured" already means on
  // these columns. This is a refusal to store garbage, not a pricing decision -
  // what an unmeasured purity SHOULD be worth is still D47's open question.
  const finiteOrNull = (n: number) => (Number.isFinite(n) ? n : null);

  const values = [
    finiteOrNull(content),
    item.scrap.purity,
    item.scrap.pre_melt,
    item.scrap.post_melt,
    item.scrap.bid_premium,
    item.scrap.purity_actual ?? item.scrap.purity,
    item.scrap.post_melt_actual ?? item.scrap.post_melt,
    finiteOrNull(content_actual),
    item.scrap.id,
  ];
  return await query(sql, values, executor);
}

// A line and its scrap row, by the LINE's id - what the refiner.items patch
// dispatch merges the refinery's report over. updateScrapItem writes every
// column it knows, so a caller holding only the changed fields must first hold
// the rest; this is where it gets them. The line's own premium rides along
// because service.updateScrapItem re-writes it in the same transaction.
export async function findScrapLineByItemId(
  order_item_id: string, executor?: Executor
): Promise<
  | {
      item_id: string;
      premium: number | null;
      scrap: {
        id: string;
        pre_melt: number | null;
        post_melt: number | null;
        purity: number | null;
        gross_unit: string | null;
        bid_premium: number | null;
        purity_actual: number | null;
        post_melt_actual: number | null;
      };
    }
  | undefined
> {
  const sql = `
    SELECT poi.id AS item_id, poi.premium,
           s.id, s.pre_melt, s.post_melt, s.purity, s.gross_unit,
           s.bid_premium, s.purity_actual, s.post_melt_actual
      FROM exchange.purchase_order_items poi
      JOIN exchange.scrap s ON s.id = poi.scrap_id
     WHERE poi.id = $1
  `;
  const { rows } = await query(sql, [order_item_id], executor);
  const row = rows[0];
  if (!row) return undefined;
  return {
    item_id: row.item_id,
    premium: row.premium,
    scrap: {
      id: row.id,
      pre_melt: row.pre_melt,
      post_melt: row.post_melt,
      purity: row.purity,
      gross_unit: row.gross_unit,
      bid_premium: row.bid_premium,
      purity_actual: row.purity_actual,
      post_melt_actual: row.post_melt_actual,
    },
  };
}

export async function deleteItems(ids: string[], executor?: Executor): Promise<QueryResult> {
  const sql = `
    DELETE FROM exchange.scrap
    WHERE id = ANY($1::uuid[]);
  `;
  return await query(sql, [ids], executor);
}

export type NewScrap = {
  metal: string;
  pre_melt?: number | null;
  purity?: number | null;
  content?: number | null;
  gross_unit?: string | null;
  bid_premium?: number | null;
};

export async function createNewItem(item: NewScrap | Record<string, any>, client?: Executor): Promise<string> {
  const metalQuery = `
    SELECT id FROM exchange.metals
    WHERE type = $1
    LIMIT 1
  `;
  const metalResult = await query(metalQuery, [item.metal], client);

  const metal_id = metalResult.rows[0].id;

  const scrapQuery = `
    INSERT INTO exchange.scrap (
      metal_id, pre_melt, purity, content, gross_unit, bid_premium
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `;
  const scrapValues = [
    metal_id,
    item.pre_melt ?? 1,
    item.purity ?? 1,
    item.content ?? (item.pre_melt ?? 1) * (item.purity ?? 1),
    item.gross_unit ?? "t oz",
    item.bid_premium ?? 0.75,
  ];
  const scrapResult = await query(scrapQuery, scrapValues, client);
  return scrapResult.rows[0].id;
}
