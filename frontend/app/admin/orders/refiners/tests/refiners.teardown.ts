import fs from 'node:fs'
import { test as teardown } from '@playwright/test'

import { adminApi, cancelOrder, ordersPath, type ReadOrders } from './e2eOrders'

teardown('cancel the refiner orders the setup created', async () => {
  if (!fs.existsSync(ordersPath)) return
  const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8')) as ReadOrders
  const request = await adminApi()
  for (const [direction, order] of Object.entries(orders)) {
    if (!order.created) continue
    const status = await cancelOrder(request, order.id)
    console.log(`[refiners.teardown] cancelled ${direction} refiner order ${order.id}: ${status}`)
  }
  await request.dispose()
  fs.rmSync(ordersPath)
})
