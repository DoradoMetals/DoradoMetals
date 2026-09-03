// media.pdfs, and nothing else.
//
// APPEND-ONLY, like media.emails. Regeneration INSERTS a new row rather than
// updating - the row is what a customer or refiner was actually SENT, and that
// does not change after the fact (migration 090's design). NO update(), NO
// remove().
//
// NO PLAIN getOne()/list() either. The only read this feature ever makes is
// "the latest document of a kind for an order" (the index pdfs_order_kind_idx
// exists to serve), so that is the one read this repo has.
import query from "#shared/db/query.ts";
import { sqlFrom } from "#shared/db/sql.ts";
import type { media } from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

const sql = sqlFrom(import.meta.dirname);

export type PdfRow = Pick<media.PdfsRow, "id" | "path" | "size_bytes" | "checksum" | "created_at">;

export type NewPdf = {
  id: string;
  kind: media.PdfsRow["kind"];
  order_id: string | null;
  path: string;
  size_bytes: number;
  checksum: string;
};

export async function latestOfKind(
  { kind, order_id }: { kind: media.PdfsRow["kind"]; order_id: string },
  executor?: Executor
): Promise<PdfRow | null> {
  const { rows } = await query<PdfRow>(sql("latest"), [order_id, kind], executor);
  return rows[0] ?? null;
}

export async function create(row: NewPdf, executor?: Executor): Promise<{ id: string }> {
  const { rows } = await query<{ id: string }>(
    sql("create"),
    [row.id, row.kind, row.order_id, row.path, row.size_bytes, row.checksum],
    executor
  );
  return rows[0];
}
