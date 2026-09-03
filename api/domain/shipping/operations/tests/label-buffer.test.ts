// A carrier response with a tracking number and no label file.
//
// WHY THIS MATTERS. parseCreateShipment reads the label document off
// `shipment?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedLabel ?? null`,
// while the tracking number comes from a different field entirely. So FedEx can
// answer with a real, billable tracking number and no label - and
// `Buffer.from(null, "base64")` throws.
//
// Both label paths built that buffer AFTER the label existed but BEFORE the try
// that compensates, so the TypeError escaped with the label left behind: no
// shipment row, no order, and no "ORPHANED SHIPPING LABEL" line either, because
// undoLabel was never reached. Silent, which is the part that mattered.
//
// 456da9f2 fixed it. This is the assertion that holds it, and it is the last of
// the money paths that had none.
//
// NO DATABASE AND NO CARRIER. labelBufferOrVoid takes `cancel` as a separate
// parameter - not a field on labelData, because labelData is what the carrier
// said - so the test passes a recorder. That is the whole reason the seam
// exists: the request that demonstrates this bug is the one that buys a label.
import { test } from "vitest";
import assert from "node:assert/strict";
import { labelBufferOrVoid, type CancelLabel } from "#domain/shipping/operations/service.ts";

// The recorder IS a CancelLabel with a `calls` array bolted on, and saying so
// is what lets the assertions below read `cancel.calls` without a cast.
type Recorder = CancelLabel & { calls: (string | null | undefined)[] };

const recorder = (): Recorder => {
  const calls: (string | null | undefined)[] = [];
  const fn = (async (trackingNumber) => {
    calls.push(trackingNumber);
  }) as Recorder;
  fn.calls = calls;
  return fn;
};

test("a label with no file is cancelled, and the failure is raised rather than swallowed", async () => {
  const cancel = recorder();

  await assert.rejects(
    () => labelBufferOrVoid({ labelFile: null, tracking_number: "794123456789" }, cancel),
    /no label file/,
    "a missing label file must not be treated as a working label"
  );

  assert.deepEqual(
    cancel.calls,
    ["794123456789"],
    "the billable label was not cancelled"
  );
});

test("a real label is decoded and nothing is cancelled", async () => {
  const cancel = recorder();
  const bytes = Buffer.from("%PDF-1.4 pretend label", "utf8");

  const buffer = await labelBufferOrVoid(
    { labelFile: bytes.toString("base64"), tracking_number: "794123456789" },
    cancel
  );

  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.toString("utf8"), "%PDF-1.4 pretend label");
  assert.deepEqual(cancel.calls, [], "a good label must not be cancelled");
});

// The case where the carrier gave us nothing at all. There is no label to
// cancel, so cancel is still called and the real undoLabel returns early on a
// falsy tracking number - what matters is that it still refuses rather than
// returning an empty buffer that would be written to a shipment row as a label.
test("a response with neither a file nor a tracking number still refuses", async () => {
  const cancel = recorder();

  await assert.rejects(
    () => labelBufferOrVoid({ labelFile: null, tracking_number: null }, cancel),
    /no label file/
  );
  assert.deepEqual(cancel.calls, [null]);
});
