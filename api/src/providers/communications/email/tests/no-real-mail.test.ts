import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sendEmail } from '#providers/communications/email/index.ts'
import * as fake from '#providers/communications/email/fake.ts'
import path from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execFileAsync = promisify(execFile)

test('sending with no transport during a test run lands in the fake, never a real server', async () => {
  const result = (await sendEmail({
    to: 'someone@example.com',
    subject: 's',
    html: '<p>x</p>',
  })) as { messageId: string }
  assert.match(result.messageId, /^fake-/, 'the real transport was reached')
  assert.equal(fake.lastMessageTo('someone@example.com')?.subject, 's')
})

test("a caller's own transport still works", async () => {
  const sent: unknown[] = []
  const result = await sendEmail(
    { to: 'someone@example.com', subject: 's', html: '<p>x</p>' },
    {
      sendMail: async (m) => {
        sent.push(m)
        return { messageId: 'recorded' }
      },
    }
  )
  assert.equal(sent.length, 1, 'the recorder was not used')
  assert.deepEqual(result, { messageId: 'recorded' })
})

test('a script that sets NODE_ENV after its imports still never reaches a real transport', async () => {
  const source = `
    process.env.NODE_ENV = "test";
    import { sendEmail } from "#providers/communications/email/index.ts";
    try {
      const result = await sendEmail({ to: "nobody@example.invalid", subject: "x", html: "x" });
      console.log(typeof result?.messageId === "string" && result.messageId.startsWith("fake-") ? "FAKED" : "OTHER");
    } catch (err) {
      console.log("THREW " + String(err?.message));
    }
  `
  const file = path.join(process.cwd(), `late-env-${randomUUID().slice(0, 8)}.mjs`)
  await fs.writeFile(file, source)
  try {
    const { stdout } = await execFileAsync(process.execPath, [file], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: '' },
      timeout: 30_000,
    })
    assert.match(
      stdout,
      /FAKED/,
      'a real transport was reached - the guard is evaluating at module load again'
    )
  } finally {
    await fs.unlink(file).catch(() => {})
  }
})

test('production refuses to boot the fake even with no EMAIL_HOST', async () => {
  const savedHost = process.env.EMAIL_HOST
  const savedEnv = process.env.NODE_ENV
  delete process.env.EMAIL_HOST
  process.env.NODE_ENV = 'production'
  try {
    await assert.rejects(
      () => sendEmail({ to: 'someone@example.com', subject: 's', html: '<p>x</p>' }),
      /refusing to use the email fake in production/
    )
  } finally {
    if (savedHost === undefined) delete process.env.EMAIL_HOST
    else process.env.EMAIL_HOST = savedHost
    process.env.NODE_ENV = savedEnv
  }
})
