import fs from 'node:fs'
import path from 'node:path'
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'

import { statePath } from '@/shared/tests/roles'

export const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api').replace(
  /\/$/,
  ''
)

export type Direction = 'sell' | 'buy'
export type ReadOrder = { id: string; created: boolean }
export type ReadOrders = Record<Direction, ReadOrder>

export const ordersPath = path.join(process.cwd(), 'playwright', '.auth', 'refiner-orders.json')

export async function adminApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ storageState: statePath('admin') })
}

export function readOrderId(direction: Direction): string {
  const stored = JSON.parse(fs.readFileSync(ordersPath, 'utf8')) as ReadOrders
  return stored[direction].id
}

export async function cancelOrder(request: APIRequestContext, id: string): Promise<number> {
  const cancelled = await request.post(`${API}/refining/orders/${id}/cancel`, { data: {} })
  return cancelled.status()
}
