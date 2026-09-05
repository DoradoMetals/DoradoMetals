import { callerId } from '#shared/http/caller.ts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import * as transactionService from '#payments/transactions/service.ts'

export const getTransactionHistory = asyncHandler(async (req, res) => {
  return res.status(200).json(await transactionService.history(callerId(req)))
})
