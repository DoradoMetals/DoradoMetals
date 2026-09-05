import { test, afterAll, beforeAll } from 'vitest'
import assert from 'node:assert/strict'
import type { PoolClient } from 'pg'
import { randomUUID } from 'node:crypto'
import pool from '#pool'
import { inPinnedTransaction } from '#shared/testing/pinned-pool.ts'
import { TEST_ACTOR } from '#shared/testing/actor.ts'
import * as service from '#logistics/shipping/carriers/service.ts'

let client: PoolClient

beforeAll(async () => {
  client = await pool.connect()
})

afterAll(async () => {
  client.release()
  await pool.end()
})

const draft = (over = {}) => ({
  logo: '/carriers/probe.png',
  organization: {
    name: `probe-${randomUUID().slice(0, 8)}`,
    email: 'probe@example.test',
    phone: '5550000',
    enabled: true,
  },
  ...over,
})

test('getAllCarriers keeps the organization as its own object', async () => {
  const [row] = await service.getAllCarriers()
  assert.deepEqual(Object.keys(row).sort(), [
    'created_at',
    'id',
    'logo',
    'organization',
    'updated_at',
  ])
  assert.deepEqual(Object.keys(row.organization).sort(), [
    'email',
    'enabled',
    'id',
    'name',
    'phone',
  ])
})

test('the FedEx carrier keeps its original id', async () => {
  const fedex = await service.getCarrierById('30179428-b311-4873-8d08-382901c581d8')
  assert.ok(fedex, 'FEDEX_CARRIER_ID must still resolve')
  assert.equal(fedex.organization.name, 'FedEx')
})

test("the list is ordered by the organization's name", async () => {
  const names = (await service.getAllCarriers()).map((c) => c.organization.name ?? '')
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b))
  )
})

test('create writes both new rows and reads back as one', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const made = await service.createCarrier(draft())
      assert.ok(made, 'the service returned nothing')
      assert.ok(made.id)
      assert.equal(made.logo, '/carriers/probe.png')

      const { rows } = await c.query(
        `SELECT o.type FROM shipping.carriers sc
       JOIN organizations.organizations o ON o.id = sc.organization_id
       WHERE sc.id = $1`,
        [made.id]
      )
      assert.equal(rows[0].type, 'CARRIER')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('update changes both the organization and the carrier row', async () => {
  await inPinnedTransaction(
    async () => {
      const made = await service.createCarrier(draft())
      assert.ok(made, 'the service returned nothing')
      const updated = await service.updateCarrier({
        ...made,
        organization: { ...made.organization, name: 'renamed', enabled: false },
        logo: '/carriers/new.png',
      })
      assert.ok(updated, 'the update returned nothing')
      assert.equal(updated.organization.name, 'renamed')
      assert.equal(updated.organization.enabled, false)
      assert.equal(updated.logo, '/carriers/new.png')
      assert.equal(updated.id, made.id)
    },
    { actor: TEST_ACTOR.id }
  )
})

test('remove deletes both rows and leaves no orphan', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const made = await service.createCarrier(draft())
      assert.ok(made, 'the service returned nothing')
      const { rows: before } = await c.query(
        'SELECT organization_id FROM shipping.carriers WHERE id = $1',
        [made.id]
      )
      const orgId = before[0].organization_id

      await service.removeCarrier(made.id)

      assert.equal(await service.getCarrierById(made.id), null)
      const { rows: orgs } = await c.query(
        'SELECT 1 FROM organizations.organizations WHERE id = $1',
        [orgId]
      )
      assert.equal(orgs.length, 0, 'organization should not be orphaned')
    },
    { actor: TEST_ACTOR.id }
  )
})

test('getCarrierName returns an empty string for an unknown id', async () => {
  assert.equal(await service.getCarrierName(randomUUID()), '')
})

test('only carrier organizations are returned', async () => {
  const rows = await service.getAllCarriers()
  const { rows: all } = await client.query(
    'SELECT count(*)::int AS n FROM organizations.organizations'
  )
  assert.ok(rows.length < all[0].n)
})

test('an update with no id changes nothing', async () => {
  await inPinnedTransaction(
    async (c: PoolClient) => {
      const { rows: before } = await c.query('SELECT count(*)::int n FROM shipping.carriers')
      assert.equal(await service.updateCarrier({ organization: { name: 'nobody' } }), null)
      const { rows: after } = await c.query('SELECT count(*)::int n FROM shipping.carriers')
      assert.equal(after[0].n, before[0].n)
    },
    { actor: TEST_ACTOR.id }
  )
})
