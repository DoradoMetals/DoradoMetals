// Serving a document: the stored file first, a live render only when no
// stored document exists.
//
// "One render, one truth" (090's design): the paper trail persists each
// document at its status event, so a download should hand back the file a
// customer or refiner was ACTUALLY SENT, not a fresh render that may disagree
// with it - the $3,236.11 packing-list/invoice disagreement happened between
// two renders of the same order. This module finishes that design for the
// download endpoints.
//
// THE STORED PATH IS GATED ON OWNERSHIP, and this is load-bearing, not
// politeness. The pdf routes carry only requireUser and always have: a caller
// renders whatever body they post, and receives a document of data they
// already possessed - nothing stored ever left the building. Serving stored
// bytes keyed on a body-supplied order id would change that into "any
// signed-in user downloads any order's real invoice". So the stored read (and
// the fallback persist) happen only for the order's owner or an admin -
// orderOwnedBy, the same question requireOwnOrder asks - and everyone else
// gets exactly what they got yesterday: a render of their own body.
//
// A STORAGE MISS MUST NOT BREAK THE DOWNLOAD. A row whose object was deleted
// out-of-band (or whose bytes no longer match their checksum) is a
// bookkeeping failure; the customer's download is not allowed to 500 over it.
// It falls back to the live render with a note on stderr - and does NOT
// persist that render, because the trail's rows are what-was-sent, and a
// fresh render is not that.
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

import minio from "#providers/s3/minio.ts";
import { isTestRun } from "#shared/testing/is-test-run.ts";
import { orderOwnedBy } from "#shared/middleware/ownership.ts";
import { linkableOrderId } from "#domain/media/emails/record.ts";
import { latestPdf, persistPdf } from "#domain/media/pdfs/store.ts";
import type { PdfKind } from "#domain/media/pdfs/store.ts";

// The same regex the quote service uses: refuse before Postgres throws 22P02
// comparing a non-uuid against a uuid column.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The storage read, as a PARAMETER - the transport precedent from
// features/media/emails/service.ts. putObject is skipped under isTestRun, so
// a test's stored row never has real bytes behind it and a real getObject
// would only ever miss; a test passes a reader that records or stubs, and the
// selection logic (which row, which fallback) is exercised for real. It is a
// separate parameter rather than a field on the input, because the input is
// built from req.body and anything read off it can be chosen by the caller.
export type StoredReader = (path: string) => Promise<Buffer>;

// The real reader. Refuses to exist during a test run, the way the shared
// mail transport does: a forgotten stub must not reach live MinIO, and the
// caller's catch turns the refusal into a live render, so even the forgetful
// test still gets a document rather than a crash.
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
  /** The order id off the request body - untrusted until orderOwnedBy says
   *  otherwise. Anything that is not a uuid string is treated as absent. */
  order_id?: unknown;
  /** req.user, as requireUser left it. */
  caller?: { id: string; role?: string | null } | null;
  /** The live render of the request body - today's whole behavior, now the
   *  fallback. Only called when no stored document is served. */
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
        // The object is gone or wrong out-of-band. The row stays - it still
        // records what was sent - and the download must still answer.
        console.error(
          `[pdfs] stored ${kind} ${row.id} for order ${orderId} could not be read, serving a live render:`,
          err
        );
        return { bytes: await render(), source: "rendered" };
      }
    }

    // No stored document: THE MIGRATION PATH FOR PRE-TRAIL ORDERS. Orders
    // from before migration 090 had their documents rendered and sent with
    // nothing persisted, so the first download after this ships renders live
    // - as every download always did - and persists the result, and the
    // SECOND download reads the store. Only for a linkable order: a pre-dual
    // order cannot be referenced by media.pdfs.order_id, so persisting would
    // write an unattached row and object on EVERY download, forever, and the
    // lookup above could never find any of them.
    const bytes = await render();
    if (await linkableOrderId(orderId, executor)) {
      await persistPdf({ kind, order_id: orderId, bytes }, executor);
    }
    return { bytes, source: "rendered" };
  }

  // No order named, or the caller is not entitled to its stored documents:
  // yesterday's exact surface - a render of the body they posted, which
  // contains nothing they did not already have.
  return { bytes: await render(), source: "rendered" };
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
