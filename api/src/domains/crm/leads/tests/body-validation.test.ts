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

test('POST /leads refuses an unknown key', async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'A', phone: null, email: null, created_by: 'someone' })
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body?.error?.message ?? '', /created_by/)
  })
})

test('POST /leads refuses a wrong type', async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .post('/api/leads')
      .send({ name: 12345, phone: null, email: null })
    assert.equal(res.status, 400, JSON.stringify(res.body))
  })
})

test('PATCH /leads/:id refuses an unknown key in the patch', async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .patch('/api/leads/11111111-1111-1111-1111-111111111111')
      .send({ user_name: 'someone' })
    assert.equal(res.status, 400, JSON.stringify(res.body))
    assert.match(res.body?.error?.message ?? '', /user_name/)
  })
})

test('PATCH /leads/:id refuses a wrong type in the patch', async () => {
  await asAdmin(async () => {
    const res = await request(app)
      .patch('/api/leads/11111111-1111-1111-1111-111111111111')
      .send({ converted: 'yes' })
    assert.equal(res.status, 400, JSON.stringify(res.body))
  })
})
