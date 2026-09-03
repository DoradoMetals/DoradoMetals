// The guard that makes it impossible for a test to email a real customer. .env carries live SMTP credentials, and "every test remembers to pass a transport" is a convention that holds until someone forgets — the one that forgets would post a fabricated order to Elemetal.
// So sendEmail refuses to build the real transport at all during a test run. This proves that refusal, the only reason to trust the rest of the email tests.
import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail } from "#providers/emails/nodemailer.ts";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);


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

// The case that defeated the first guard: a module-level const captured NODE_ENV before a script's own `process.env.NODE_ENV = "test"` (set after imports, which are hoisted) took effect — scripts/seed-e2e-users.mjs reached Gmail that way. Run in a child process since the parent already has NODE_ENV=test and can't reproduce the condition.
test("a script that sets NODE_ENV after its imports is still refused", async () => {
  const source = `
    process.env.NODE_ENV = "test";
    import { sendEmail } from "#providers/emails/nodemailer.ts";
    try {
      await sendEmail({ to: "nobody@example.invalid", subject: "x", html: "x" });
      console.log("LEAKED");
    } catch (err) {
      console.log(/refusing to build the real mail transport/.test(String(err?.message)) ? "REFUSED" : "OTHER");
    }
  `;
  const file = path.join(process.cwd(), `late-env-${randomUUID().slice(0, 8)}.mjs`);
  await fs.writeFile(file, source);
  try {
    const { stdout } = await execFileAsync(process.execPath, [file], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "" },
      timeout: 30_000,
    });
    assert.match(
      stdout,
      /REFUSED/,
      "the real transport was built - the guard is evaluating at module load again"
    );
  } finally {
    await fs.unlink(file).catch(() => {});
  }
});

