// The guard that makes it impossible for a test to email a real customer.
//
// .env carries live SMTP credentials and this application's recipients are real
// customers and real refiners. sendEmail takes an optional transport so tests
// can record instead of send - but "every test remembers to pass one" is a
// convention, and a convention holds until the day someone writes the test that
// forgets. The one that forgets would post a fabricated order to Elemetal.
//
// So sendEmail refuses to construct the real transport at all during a test
// run. This proves that refusal, which is the only reason to trust the rest of
// the email tests.
import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "#features/emails/utils/sendEmail.ts";

test("sending with no transport is refused during a test run", async () => {
  await assert.rejects(
    () => sendEmail({ to: "someone@example.com", subject: "s", html: "<p>x</p>" }),
    /refusing to build the real mail transport/,
    "a test could reach the real SMTP transport"
  );
});

// The guard must not be so broad that it breaks the legitimate path, or the
// email tests would be passing for the wrong reason.
test("a caller's own transport still works", async () => {
  const sent = [];
  const result = await sendEmail(
    { to: "someone@example.com", subject: "s", html: "<p>x</p>" },
    { sendMail: async (m) => { sent.push(m); return { messageId: "recorded" }; } }
  );
  assert.equal(sent.length, 1, "the recorder was not used");
  assert.deepEqual(result, { messageId: "recorded" });
});
