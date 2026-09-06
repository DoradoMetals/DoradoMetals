import {
  CheckoutLotsBody,
  CheckoutPatch,
  CheckoutPatchBody,
  CheckoutPayoutBody,
  CheckoutPayoutForm,
  Direction,
} from '@dorado/contracts'
import type { Request } from 'express'
import { callerId } from '#shared/http/caller.ts'
import { oneString } from '#shared/http/query.ts'
import { parseStrict } from '#shared/http/validate.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as cartService from '#checkout/service.ts'
import withTransaction from '#shared/db/withTransaction.ts'

function subjectOf(req: Request): Promise<string> {
  const named = req.query?.user_id ?? req.body?.user_id
  return cartService.resolveSubject(callerId(req), req.user?.role === 'admin', oneString(named))
}

export const getCheckoutLots = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, oneString(req.query.direction), 'direction')
  return res.status(200).json(await cartService.listLots(await subjectOf(req), direction))
})

export const putCheckoutLots = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, oneString(req.query.direction), 'direction')
  const body = parseStrict(CheckoutLotsBody, req.body, 'checkout/lots body')
  const subject = await subjectOf(req)
  return res
    .status(200)
    .json(await withTransaction((tx) => cartService.replaceLots(subject, direction, body.lots, tx)))
})

export const deleteCheckoutLots = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, oneString(req.query.direction), 'direction')
  const removed = await cartService.clearLots(await subjectOf(req), direction)
  return res.status(200).json({ removed })
})

export const getCheckout = asyncHandler(async (req, res) => {
  const direction = parseStrict(Direction, oneString(req.query.direction), 'direction')
  const subject = await subjectOf(req)
  return res.status(200).json(await cartService.getCheckout(subject, direction))
})

export const patchCheckout = asyncHandler(async (req, res) => {
  const body = parseStrict(CheckoutPatchBody, req.body, 'checkout PATCH body')
  const patch = CheckoutPatch.parse(body)
  const subject = await subjectOf(req)
  return res
    .status(200)
    .json(
      await withTransaction((tx) => cartService.patchCheckout(subject, body.direction, patch, tx))
    )
})

export const saveCheckoutPayout = asyncHandler(async (req, res) => {
  const body = parseStrict(CheckoutPayoutBody, req.body, 'checkout/payout body')
  const form = CheckoutPayoutForm.parse(body)
  const caller = callerId(req)
  return res
    .status(200)
    .json(
      await withTransaction((tx) =>
        cartService.saveCheckoutPayout(caller, body.direction, form, tx)
      )
    )
})
