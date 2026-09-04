import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import minio from "#providers/s3/minio.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import { orderOwnedBy } from "#shared/middleware/ownership.ts";
import { linkableOrderId } from "#domain/media/emails/record.ts";
import { latestPdf, persistPdf } from "#domain/media/pdfs/store.ts";
import type { PdfKind } from "#domain/media/pdfs/store.ts";
import { attempt } from "#shared/attempt.ts";
import * as rules from "#domain/media/pdfs/rules.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StoredReader = (path: string) => Promise<Buffer>;

const readFromStorage: StoredReader = async (path) => {
  rules.assertNotTestRun(isTestRun());
  const stream = await minio.getObject(process.env.MINIO_BUCKET as string, path);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

type ServeInput = {
  kind: PdfKind;
  order_id?: unknown;
  caller?: { id: string; role?: string | null } | null;
  render: () => Promise<Uint8Array>;
};

type ServedDocument = {
  bytes: Uint8Array;
  source: "stored" | "rendered";
};

export async function serveOrderDocument(
  { kind, order_id, caller, render }: ServeInput,
  storage: StoredReader = readFromStorage,
  executor?: PoolClient
): Promise<ServedDocument> {
  const orderId =
    typeof order_id === "string" && UUID.test(order_id) ? order_id : null;

  const entitled =
    orderId !== null &&
    !!caller?.id &&
    (caller.role === "admin" || (await orderOwnedBy(orderId, caller.id, executor)));

  if (entitled && orderId) {
    const row = await latestPdf({ kind, order_id: orderId }, executor);

    if (row) {
      const bytes = await attempt(`read stored ${kind} ${row.id} for order ${orderId}`, async () => {
        const b = await storage(row.path);
        if (row.checksum) rules.assertChecksum(sha256(b) === row.checksum, row.checksum);
        return b;
      });
      if (bytes) return { bytes, source: "stored" };
      return { bytes: await render(), source: "rendered" };
    }

    const bytes = await render();
    if (await linkableOrderId(orderId, executor)) {
      await persistPdf({ kind, order_id: orderId, bytes }, executor);
    }
    return { bytes, source: "rendered" };
  }

  return { bytes: await render(), source: "rendered" };
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
