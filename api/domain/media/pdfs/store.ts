import { createHash, randomUUID } from "node:crypto";
import minio from "#providers/s3/minio.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import { linkableOrderId } from "#domain/media/emails/record.ts";
import * as pdfs from "#db/media/pdfs/repo.ts";
import type { PdfRow } from "#db/media/pdfs/repo.ts";
import type { PoolClient } from "pg";
import { attempt } from "#shared/attempt.ts";

type Executor = PoolClient | undefined;

export type PdfKind =
  | "packing_list"
  | "return_packing_list"
  | "invoice"
  | "sales_order_invoice";

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
  if (isTestRun() && !executor) return null;
  const id = await attempt(`persist ${kind} PDF for order ${order_id ?? "?"}`, async () => {
    const pdfId = randomUUID();
    const path = `pdfs/${order_id ?? "unattached"}/${kind}-${pdfId}.pdf`;
    const buffer = Buffer.from(bytes);
    const checksum = createHash("sha256").update(buffer).digest("hex");

    if (!isTestRun()) {
      await minio.putObject(process.env.MINIO_BUCKET as string, path, buffer);
    }

    const linkable = await linkableOrderId(order_id, executor);
    const written = await pdfs.create({
      id: pdfId, kind, order_id: linkable, path, size_bytes: buffer.length, checksum,
    }, executor);
    return written.id;
  });
  return id ?? null;
}
