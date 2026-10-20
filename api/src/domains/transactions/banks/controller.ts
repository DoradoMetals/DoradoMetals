import { isStaff } from '#shared/middleware/authMiddleware.ts'
import {
  BankLinkSendBody,
  ExchangeLinkBody,
  FakeLinkBody,
  LinkTokenBody,
  MicroDepositsBody,
  VaultedLinkBody,
  VerifyMicroDepositsBody,
} from '@dorado/contracts'
import { asyncHandler } from '#shared/middleware/asyncHandler.ts'
import { parseStrict, uuidParam } from '#shared/http/validate.ts'
import { callerId } from '#shared/http/caller.ts'
import { refuseWith } from '#shared/http/refuse.ts'
import * as banks from '#transactions/banks/service.ts'

function subjectOf(req: Parameters<typeof callerId>[0]): string {
  const body = parseStrict(LinkTokenBody, req.body, 'payments/banks link_token body')
  if (body.user_id && req.user?.role !== 'admin') {
    return refuseWith(403, 'only an admin may link a bank account for another customer')
  }
  return body.user_id ?? callerId(req)
}

export const listBankLinks = asyncHandler(async (req, res) => {
  return res.json(await banks.linkedAccounts(callerId(req)))
})

export const listCustomerBankLinks = asyncHandler(async (req, res) => {
  const user_id = uuidParam(req, 'id')
  banks.assertMayRead(user_id, callerId(req), isStaff(req))
  return res.json(await banks.linkedAccounts(user_id))
})

export const sendBankLink = asyncHandler(async (req, res) => {
  const { channel } = parseStrict(BankLinkSendBody, req.body, 'accounts/bank-links body')
  return res.status(201).json(await banks.sendHostedLink(uuidParam(req, 'id'), channel))
})

export const resendBankLink = asyncHandler(async (req, res) => {
  return res.json(await banks.resendHostedLink(uuidParam(req, 'id'), uuidParam(req, 'linkId')))
})

export const completeFakeLink = asyncHandler(async (req, res) => {
  const { link_id } = parseStrict(FakeLinkBody, req.body, 'webhooks/plaid/fake body')
  return res.json(await banks.completeWithFake(link_id))
})

export const createLinkToken = asyncHandler(async (req, res) => {
  return res.json(await banks.linkToken(subjectOf(req)))
})

export const linkFromPlaid = asyncHandler(async (req, res) => {
  const body = parseStrict(ExchangeLinkBody, req.body, 'payments/banks link body')
  return res.status(201).json(await banks.linkFromPlaid(callerId(req), body))
})

export const linkByMicroDeposits = asyncHandler(async (req, res) => {
  const body = parseStrict(MicroDepositsBody, req.body, 'payments/banks micro_deposits body')
  return res.status(201).json(await banks.linkByMicroDeposits(callerId(req), body))
})

export const verifyMicroDeposits = asyncHandler(async (req, res) => {
  const body = parseStrict(VerifyMicroDepositsBody, req.body, 'payments/banks verify body')
  return res.json(await banks.verifyMicroDeposits(callerId(req), uuidParam(req, 'id'), body))
})

export const recordVaultedLink = asyncHandler(async (req, res) => {
  const body = parseStrict(VaultedLinkBody, req.body, 'payments/banks vaulted body')
  return res
    .status(201)
    .json(await banks.recordVaultedLink(body.user_id, body.moov_account_id, body.payment_method_id))
})
