import fs from 'node:fs'
import path from 'node:path'
import { expect, test as setup } from '@playwright/test'

import {
  API,
  adminApi,
  ordersPath,
  type Direction,
  type ReadOrder,
  type ReadOrders,
} from './e2eOrders'

type Listed = {
  id: string
  state: string
  settled_at: string | null
  settlement: { settled_lots: number }
  lots: unknown[]
  actions: { name: string }[]
}

setup('pick or create the refiner orders the read specs share', async () => {
  const request = await adminApi()
  const pick = async (direction: Direction): Promise<ReadOrder> => {
    const listed = await request.get(`${API}/refining/orders?direction=${direction}&limit=200`)
    expect(listed.ok(), `GET /refining/orders answered ${listed.status()}`).toBeTruthy()
    const { items } = (await listed.json()) as { items: Listed[] }
    const score = (item: Listed) =>
      (item.actions.some((a) => a.name === 'cancel') ? 4 : 0) +
      (item.settled_at === null && item.settlement.settled_lots === 0 ? 2 : 0) +
      (item.lots.length > 0 ? 1 : 0)
    const best = items
      .filter((item) => item.state !== 'Cancelled')
      .sort((a, b) => score(b) - score(a))[0]
    if (best) return { id: best.id, created: false }

    const refiners = await request.get(`${API}/suppliers/get_all`)
    const [refiner] = (await refiners.json()) as { id: string }[]
    expect(refiner, `no refiner exists to create a ${direction} order for`).toBeTruthy()
    const made = await request.post(`${API}/refining/orders`, {
      data: { refiner_id: refiner.id, direction },
    })
    expect(made.status()).toBe(201)
    const id = ((await made.json()) as { id: string }).id
    console.log(`[refiners.setup] created ${direction} refiner order ${id}`)
    return { id, created: true }
  }

  const orders: ReadOrders = { sell: await pick('sell'), buy: await pick('buy') }
  await request.dispose()
  fs.mkdirSync(path.dirname(ordersPath), { recursive: true })
  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2))
})
