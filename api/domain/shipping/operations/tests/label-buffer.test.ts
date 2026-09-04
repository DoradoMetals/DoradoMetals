import { test } from "vitest";
import assert from "node:assert/strict";
import { labelBufferOrVoid, voidLabel } from "#domain/shipping/operations/service.ts";

type Recorder = typeof voidLabel & { calls: (string | null | undefined)[] };

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

test("a response with neither a file nor a tracking number still refuses", async () => {
  const cancel = recorder();

  await assert.rejects(
    () => labelBufferOrVoid({ labelFile: null, tracking_number: null }, cancel),
    /no label file/
  );
  assert.deepEqual(cancel.calls, [null]);
});
