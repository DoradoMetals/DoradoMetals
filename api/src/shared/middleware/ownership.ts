import type { NextFunction, Request, Response } from 'express'
import type { PoolClient } from 'pg'
import query from '#shared/db/query.ts'

type OrderBody = {
  order?: { id?: string | null } | null
  order_id?: string | null
}

function orderIdFrom(body: OrderBody = {}): string | null {
  return body.order?.id ?? body.order_id ?? null
}

export async function orderOwnedBy(
  orderId: string,
  userId: string,
  executor?: PoolClient
): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM orders.orders WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [orderId, userId],
    executor
  )
  return rows.length > 0
}

export function requireOwnOrder(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (req.user.role === 'admin') return next()

  const orderId = orderIdFrom(req.body)
  if (!orderId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'no order was named',
    })
  }

  orderOwnedBy(orderId, req.user.id)
    .then((owned) => {
      if (!owned) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'That order is not yours',
        })
      }
      next()
    })
    .catch(next)
}

export function requireOwnOrderParam(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (req.user.role === 'admin') return next()

  const raw = req.params.id ?? req.params.orderId
  const orderId = Array.isArray(raw) ? raw[0] : raw
  if (!orderId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'no order was named',
    })
  }

  orderOwnedBy(orderId, req.user.id)
    .then((owned) => {
      if (!owned) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'That order is not yours',
        })
      }
      next()
    })
    .catch(next)
}

export function requireOwnShipment(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (req.user.role === 'admin') return next()

  const rawParam = req.params?.id
  const shipmentId =
    req.body?.shipment_id ??
    req.query?.shipment_id ??
    (Array.isArray(rawParam) ? rawParam[0] : rawParam) ??
    null
  if (!shipmentId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'no shipment was named',
    })
  }

  query(
    `SELECT 1
       FROM fulfillments.shipments fs
       JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
       JOIN orders.orders o ON o.id = f.order_id
      WHERE fs.shipment_id = $1 AND o.user_id = $2
      LIMIT 1`,
    [shipmentId, req.user.id]
  )
    .then(({ rows }) => {
      if (!rows.length) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'That shipment is not yours',
        })
      }
      next()
    })
    .catch(next)
}
