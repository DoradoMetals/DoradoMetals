// Persisting a generated document: bytes to object storage, one immutable row
// to media.pdfs.
//
// THE PAPER TRAIL MUST NEVER BREAK THE THING IT RECORDS. Every caller is on a
// path that ends in an email or a download; a storage hiccup or a refused
// insert loses one record, not one order. So this catches everything, says so
// on stderr, and returns null - the caller carries on with pdf_id null.
//
// Regeneration INSERTS, never updates - the row is what a customer or refiner
// was actually sent, and that does not change after the fact (migration 090's
// design, decided with Jacob 2026-08-28). The read is "latest of a kind for
// an order", served by pdfs_order_kind_idx.
//
// order_id references orders.orders. An order that predates dual has no row
// there, and losing the whole record over the link would be backwards - the
// insert retries once with order_id null, keeping the document and its path.
import { createHash, randomUUID } from "node:crypto";
import minio from "#providers/s3/minio.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import query from "#shared/db/query.js";
import { linkableOrderId } from "#features/media/emails/record.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type PdfKind =
  | "packing_list"
  | "return_packing_list"
  | "invoice"
  | "sales_order_invoice";

const INSERT = `
  INSERT INTO media.pdfs (id, kind, order_id, path, size_bytes, checksum)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING id
`;

// "The order's documents, latest of a kind first" - the read
// pdfs_order_kind_idx exists to serve (090's own comment). Regeneration
// INSERTS rather than updating, so the newest row IS the current document.
const LATEST = `
  SELECT id, path, size_bytes, checksum, created_at
    FROM media.pdfs
   WHERE order_id = $1 AND kind = $2
   ORDER BY created_at DESC
   LIMIT 1
`;

export type PdfRow = {
  id: string;
  path: string;
  size_bytes: number | null;
  checksum: string | null;
  created_at: Date;
};

/** The latest stored document of a kind for an order, or null if the order
 *  predates the paper trail (or predates dual - media.pdfs.order_id references
 *  orders.orders, so a pre-dual order can never have a row). */
export async function latestPdf(
  { kind, order_id }: { kind: PdfKind; order_id: string },
  executor?: Executor
): Promise<PdfRow | null> {
  const { rows } = await query<PdfRow>(LATEST, [order_id, kind], executor);
  return rows[0] ?? null;
}

export async function persistPdf(
  { kind, order_id, bytes }: { kind: PdfKind; order_id?: string | null; bytes: Uint8Array },
  executor?: Executor
): Promise<string | null> {
  // The same stance the mail transport takes about mail: A TEST RUN MUST NOT
  // WRITE REAL STORAGE OR COMMIT REAL ROWS. A test that wants the trail
  // passes its transaction and gets the row (rolled back with the rest);
  // the object put is skipped outright, and a test that passes nothing gets
  // nothing rather than a leak into dev on every suite run.
  if (isTestRun() && !executor) return null;
  try {
    const id = randomUUID();
    const path = `pdfs/${order_id ?? "unattached"}/${kind}-${id}.pdf`;
    const buffer = Buffer.from(bytes);
    const checksum = createHash("sha256").update(buffer).digest("hex");

    if (!isTestRun()) {
      await minio.putObject(process.env.MINIO_BUCKET as string, path, buffer);
    }

    // Same pre-check as recordEmail: a refused FK inside a caller's
    // transaction would poison it, so the link is verified, never discovered.
    const linkable = await linkableOrderId(order_id, executor);
    const { rows } = await query(
      INSERT, [id, kind, linkable, path, buffer.length, checksum], executor
    );
    return rows[0].id;
  } catch (err) {
    console.error(`[pdfs] failed to persist ${kind} for order ${order_id ?? "?"}:`, err);
    return null;
  }
}
