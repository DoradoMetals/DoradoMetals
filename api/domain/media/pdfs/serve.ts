// Serving a document: the stored file first, live render only as fallback. "One render, one truth": a download must hand back the file actually SENT, not a fresh render that may disagree with it - the $3,236.11 packing-list/invoice disagreement happened between two renders of the same order.
// The stored path is gated on ownership, load-bearing not politeness: the routes carry only requireUser, so a caller renders their own posted body and gets nothing they didn't already have - serving stored bytes keyed on a body-supplied order id would let any signed-in user download any order's real invoice. Gated the same way requireOwnOrder is (orderOwnedBy); everyone else gets a render of their own body, same as always.
// A storage miss must not break the download: a deleted or checksum-mismatched object is a bookkeeping failure, not a 500 - it falls back to a live render (unpersisted, since a fresh render isn't what-was-sent) with a note on stderr.
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import minio from "#providers/s3/minio.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import { orderOwnedBy } from "#shared/middleware/ownership.ts";
import { linkableOrderId } from "#domain/media/emails/record.ts";
import { latestPdf, persistPdf } from "#domain/media/pdfs/store.ts";
import type { PdfKind } from "#domain/media/pdfs/store.ts";

// Same regex as the quote service: refuse before Postgres throws 22P02 comparing a non-uuid against a uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The storage read, as a PARAMETER (same precedent as media/emails/service.ts's transport) - a test passes a reader that stubs, so the selection logic (which row, which fallback) is exercised for real.
// Separate parameter rather than a field on the input, since the input is built from req.body and anything read off it can be chosen by the caller.
export type StoredReader = (path: string) => Promise<Buffer>;

// The real reader - refuses to exist during a test run (like the shared mail transport): a forgotten stub must not reach live MinIO; the caller's catch turns the refusal into a live render instead of a crash.
const readFromStorage: StoredReader = async (path) => {
  if (isTestRun()) {
    throw new Error(
      "refusing to read real object storage during a test run - pass a StoredReader"
    );
  }
  const stream = await minio.getObject(process.env.MINIO_BUCKET as string, path);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

type ServeInput = {
  kind: PdfKind;
  /** The order id off the request body - untrusted until orderOwnedBy says otherwise; anything not a uuid string is treated as absent. */
  order_id?: unknown;
  /** req.user, as requireUser left it. */
  caller?: { id: string; role?: string | null } | null;
  /** The live render of the request body - now only the fallback, called when no stored document is served. */
  render: () => Promise<Uint8Array>;
};

type ServedDocument = {
  bytes: Uint8Array;
  /** Which truth answered: the stored file, or a fresh render. */
  source: "stored" | "rendered";
};

export async function serveOrderDocument(
  { kind, order_id, caller, render }: ServeInput,
  // Test seams, exactly like (transport, executor) on the email senders.
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
      try {
        const bytes = await storage(row.path);
        if (row.checksum && sha256(bytes) !== row.checksum) {
          throw new Error(`bytes do not match stored checksum ${row.checksum}`);
        }
        return { bytes, source: "stored" };
      } catch (err) {
        // The object is gone or wrong out-of-band - the row stays (it still records what was sent), and the download must still answer.
        console.error(
          `[pdfs] stored ${kind} ${row.id} for order ${orderId} could not be read, serving a live render:`,
          err
        );
        return { bytes: await render(), source: "rendered" };
      }
    }

    // No stored document: pre-trail orders had nothing persisted, so the first download renders live and persists the result - the second download reads the store.
    // Only for a linkable order: an order media.pdfs.order_id can't reference would get an unattached row and object on EVERY download, forever, with the lookup above never finding any of them.
    const bytes = await render();
    if (await linkableOrderId(orderId, executor)) {
      await persistPdf({ kind, order_id: orderId, bytes }, executor);
    }
    return { bytes, source: "rendered" };
  }

  // No order named, or not entitled to its stored documents: same surface as before - a render of the body they posted, containing nothing they didn't already have.
  return { bytes: await render(), source: "rendered" };
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
