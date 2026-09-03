// Persisting a generated document: bytes to object storage, one immutable row to media.pdfs. The paper trail must never break the thing it records - a storage hiccup or refused insert loses one record, not one order, so this catches everything, logs to stderr, and returns null (caller carries on with pdf_id null).
// Regeneration INSERTS, never updates - the row is what was actually sent and doesn't change after the fact. Read is "latest of a kind for an order", served by pdfs_order_kind_idx.
// order_id references orders.orders - an order with no row there would lose the whole record over the link, so the insert retries once with order_id null, keeping the document and its path.
import { reportError } from "#shared/observability/report.ts";
import { createHash, randomUUID } from "node:crypto";
import minio from "#providers/s3/minio.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import { linkableOrderId } from "#domain/media/emails/record.ts";
import * as pdfs from "#db/media/pdfs/repo.ts";
import type { PdfRow } from "#db/media/pdfs/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type PdfKind =
  | "packing_list"
  | "return_packing_list"
  | "invoice"
  | "sales_order_invoice";

/** The latest stored document of a kind for an order, or null if the order predates the paper trail (media.pdfs.order_id references orders.orders, so an order with no row there can never have one). */
export async function latestPdf(
  { kind, order_id }: { kind: PdfKind; order_id: string },
  executor?: Executor
): Promise<PdfRow | null> {
  return await pdfs.latestOfKind({ kind, order_id }, executor);
}

export async function persistPdf(
  { kind, order_id, bytes }: { kind: PdfKind; order_id?: string | null; bytes: Uint8Array },
  executor?: Executor
): Promise<string | null> {
  // Same stance as the mail transport: a test run must not write real storage or commit real rows - a test wanting the trail passes its transaction (rolled back with the rest); the object put is skipped outright, and passing nothing means nothing happens, not a leak into dev.
  if (isTestRun() && !executor) return null;
  try {
    const id = randomUUID();
    const path = `pdfs/${order_id ?? "unattached"}/${kind}-${id}.pdf`;
    const buffer = Buffer.from(bytes);
    const checksum = createHash("sha256").update(buffer).digest("hex");

    if (!isTestRun()) {
      await minio.putObject(process.env.MINIO_BUCKET as string, path, buffer);
    }

    // Same pre-check as recordEmail: a refused FK inside a caller's transaction would poison it, so the link is verified, never discovered.
    const linkable = await linkableOrderId(order_id, executor);
    const written = await pdfs.create({
      id, kind, order_id: linkable, path, size_bytes: buffer.length, checksum,
    }, executor);
    return written.id;
  } catch (err) {
    reportError({
      at: "media.pdfs.store",
      message: `the ${kind} PDF for order ${order_id ?? "?"} was not persisted`,
      err,
      extra: { kind, order_id: order_id ?? null },
    });
    return null;
  }
}
