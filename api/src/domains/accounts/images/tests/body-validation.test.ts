import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(() => restoreSessions())

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  role: 'user',
  name: 'U',
  email: 'u@x.test',
}
const asUser = <T>(fn: () => Promise<T> | T) => as(user, fn)

test('POST /images refuses the retired `path` field', async () => {
  await asUser(async () => {
    const res = await request(app)
      .post('/api/images')
      .send({ filename: 'a.png', mime_type: 'image/png', size_bytes: 10, path: 'anywhere/' })
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body?.error?.message ?? '', /path/)
  })
})

test('POST /images refuses a wrong type', async () => {
  await asUser(async () => {
    const res = await request(app)
      .post('/api/images')
      .send({ filename: 'a.png', size_bytes: 'ten' })
    assert.equal(res.status, 400, JSON.stringify(res.body))
  })
})

test('POST /images refuses a missing mime_type at the boundary, not with a 23502', async () => {
  await asUser(async () => {
    const res = await request(app).post('/api/images').send({ filename: 'a.png' })
    assert.equal(
      res.status,
      400,
      'media.images.mime_type is NOT NULL with no default, so an absent one used ' +
        `to reach the INSERT and answer 500: ${JSON.stringify(res.body)}`
    )
    assert.match(res.body?.error?.message ?? '', /mime_type/)
  })
})

test('POST /images refuses an explicitly null mime_type too', async () => {
  await asUser(async () => {
    const res = await request(app)
      .post('/api/images')
      .send({ filename: 'a.png', mime_type: null })
    assert.equal(res.status, 400, JSON.stringify(res.body))
  })
})
