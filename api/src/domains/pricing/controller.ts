import { Direction, OrderQuoteBody, ProductQuoteBody } from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { callerId } from '#shared/http/caller.ts'
import { oneString } from '#shared/http/query.ts'
import { parseStrict } from '#shared/http/validate.ts'
import * as pricing from '#pricing/index.ts'
import * as checkoutService from '#checkout/service.ts'

export const catalogQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(ProductQuoteBody, req.body, 'quotes/catalog body')
  res.status(200).json(await pricing.priceProduct(body.bullion_id, body.side, body.quantity ?? 1))
})

export const checkoutQuote = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, oneString(req.query.direction), 'direction')
  const subject = await checkoutService.resolveSubject(
    callerId(req),
    req.user?.role === 'admin',
    oneString(req.query.user_id)
  )
  const basket = await checkoutService.getRowFor(subject, direction)
  res.status(200).json(await pricing.priceCheckout(basket.id))
})

export const orderQuote = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, 'quotes/order body')
  res.status(200).json(await pricing.priceOrder(body.order_id))
})

export const profitBreakdown = asyncHandler(async (req, res) => {
  const body = parseStrict(OrderQuoteBody, req.body, 'quotes/profit_breakdown body')
  res.status(200).json(await pricing.profitBreakdown(body.order_id))
})
