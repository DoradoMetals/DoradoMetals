import { test, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import request from 'supertest'
import { mockSessions, restoreSessions, as } from '#shared/testing/session.ts'

await mockSessions()
const { default: app } = await import('#app')

afterAll(() => restoreSessions())

const admin = {
  id: '11111111-1111-1111-1111-111111111111',
  role: 'admin',
  name: 'Admin',
  email: 'admin@x.test',
}
const asAdmin = <T>(fn: () => Promise<T> | T) => as(admin, fn)

test('POST /carriers/create refuses an unknown key', async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post('/api/carriers/create')
      .send({ carrier: { organization: { name: 'X', is_active: true } } })
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body?.error?.message ?? '', /is_active/)
  })
})

test('POST /carriers/create refuses a wrong type', async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post('/api/carriers/create')
      .send({ carrier: { organization: { name: 'X', enabled: 'yes' } } })
    assert.equal(res.status, 400, JSON.stringify(res.body))
  })
})

test("POST /carriers/update refuses the organization's own id", async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post('/api/carriers/update')
      .send({
        carrier: {
          id: '11111111-1111-1111-1111-111111111111',
          organization: { id: '22222222-2222-2222-2222-222222222222', name: 'X' },
        },
      })
    assert.equal(res.status, 400, JSON.stringify(res.body))
  })
})
