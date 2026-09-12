import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import { orders, paymentTransfers as transfers, bankLinks, refiningOrders } from '#db'
import * as moov from '#providers/moov/index.ts'
import * as rails from '#transactions/rails/service.ts'
import {
  assertKind,
  assertOpenable,
  assertOverrideReason,
  assertPayable,
  assertOneOrder,
  assertRail,
  assertTransfer,
  assertWalletMethod,
  assertWritten,
  centsOf,
  openingState,
  overrideFor,
  payoutOverrideFor,
  referenceFor,
  refiningReferenceFor,
  transferKeyFor,
} from '#transactions/rails/rules.ts'
import * as accounts from '#accounts/auth/step-up.ts'
import { PayTo as PayToShape } from '@dorado/contracts'
import type { BankLink, OpenPayoutBody, PayTo, SendPayoutBody, Transfer } from '@dorado/contracts'

const MOOV = 'moov'
const MANUAL = 'manual'

export async function openPayout(
  body: OpenPayoutBody,
  session_id: string | null = null
): Promise<Transfer> {
  assertOneOrder(body.order_id, body.refining_order_id)
  assertRail(body.rail, 'payout')
  if (body.refining_order_id) return await openRefiningPayout(body, body.refining_order_id)

  const order_id = body.order_id as string
  const order = await orders.getOne(order_id)
  const owed = assertOpenable(order_id, order?.totals?.total)
  const excess = payoutOverrideFor(owed, body.amount)
  const standing = await transfers.getForOrder(order_id, 'payout')
  const second =
    standing && !['Not sent', 'Due'].includes(standing.state)
      ? `order ${order?.number} already has a ${standing.state} payout`
      : null
  const reason = excess ?? second

  if (reason !== null) {
    assertOverrideReason(body.override_reason, reason)
    await accounts.assertSteppedUp(session_id)
  }

  return await withTransaction(async (tx) => {
    const created = await transfers.create(
      {
        order_id,
        refining_order_id: null,
        kind: 'payout',
        rail: body.rail,
        state: openingState('payout'),
        amount: body.amount ?? owed,
        counterparty_user_id: order?.user_id ?? null,
        details_id: body.details_id ?? order?.totals?.payout_details_id ?? null,
        bank_link_id: body.bank_link_id ?? null,
        provider: null,
        provider_ref: null,
        reference: referenceFor(order?.direction ?? null, order?.number ?? 0),
        idempotency_key: null,
        override_reason: reason === null ? null : (body.override_reason as string),
      },
      tx
    )
    if (created) return created
    return assertTransfer(order_id, await transfers.getForOrder(order_id, 'payout', tx))
  })
}

async function openRefiningPayout(
  body: OpenPayoutBody,
  refining_order_id: string
): Promise<Transfer> {
  return await withTransaction(async (tx) => {
    const order = await refiningOrders.view(refining_order_id, tx)
    const owed = assertOpenable(refining_order_id, order?.totals.total)

    const created = await transfers.create(
      {
        order_id: null,
        refining_order_id,
        kind: 'payout',
        rail: body.rail,
        state: openingState('payout'),
        amount: owed,
        counterparty_user_id: null,
        details_id: body.details_id ?? null,
        bank_link_id: body.bank_link_id ?? null,
        provider: null,
        provider_ref: null,
        reference: refiningReferenceFor(order?.number ?? 0),
        idempotency_key: null,
        override_reason: null,
      },
      tx
    )
    if (created) return created
    return assertTransfer(
      refining_order_id,
      await transfers.getForRefiningOrder(refining_order_id, 'payout', tx)
    )
  })
}

async function payoutAccount(transfer: Transfer): Promise<BankLink> {
  const named = transfer.bank_link_id ? await bankLinks.getOne(transfer.bank_link_id) : undefined
  const fallback = transfer.counterparty_user_id
    ? await bankLinks.findAccount(transfer.counterparty_user_id)
    : undefined
  return assertPayable(transfer, named ?? fallback)
}

export async function sendPayout(
  transfer_id: string,
  body: SendPayoutBody = {},
  session_id: string | null = null
): Promise<Transfer> {
  const opened = assertKind(
    assertTransfer(transfer_id, await transfers.getOne(transfer_id)),
    'payout'
  )
  const reason = overrideFor(opened)
  if (reason !== null) {
    assertOverrideReason(body.override_reason, reason)
    await accounts.assertSteppedUp(session_id)
    await withTransaction(async (tx) => {
      assertWritten(
        transfer_id,
        await transfers.update(transfer_id, { override_reason: body.override_reason }, {}, tx)
      )
    })
  }
  const link = await payoutAccount(opened)
  const source = assertWalletMethod(process.env.MOOV_WALLET_PAYMENT_METHOD_ID)

  await withTransaction(async (tx) => {
    assertWritten(
      transfer_id,
      await transfers.update(
        transfer_id,
        {
          state: 'Processing',
          provider: MOOV,
          bank_link_id: link.id,
          rail: opened.rail,
        },
        { state: opened.state },
        tx
      )
    )
  })

  const sent = await attempt('moov.createTransfer', async () =>
    moov.rails().createTransfer({
      sourcePaymentMethodID: source,
      destinationPaymentMethodID: link.payment_method_id as string,
      amountCents: centsOf(opened.amount),
      description: opened.reference ?? transfer_id,
      idempotencyKey: transferKeyFor(transfer_id),
    })
  )

  if (!sent) {
    await rails.markFailed(transfer_id, 'the provider did not accept the transfer')
    return await rails.getTransfer(transfer_id)
  }

  await withTransaction(async (tx) => {
    const current = assertTransfer(transfer_id, await transfers.getOne(transfer_id, tx))
    await rails.markProcessing(current, sent.transferID, tx)
  })
  return await rails.getTransfer(transfer_id)
}

export async function markSent(transfer_id: string, reference: string): Promise<Transfer> {
  await withTransaction(async (tx) => {
    const current = assertKind(
      assertTransfer(transfer_id, await transfers.getOne(transfer_id, tx)),
      'payout'
    )
    assertWritten(
      transfer_id,
      await transfers.update(
        transfer_id,
        { provider: MANUAL, provider_ref: reference, reference },
        { state: current.state },
        tx
      )
    )
    const stamped = assertTransfer(transfer_id, await transfers.getOne(transfer_id, tx))
    assertWritten(transfer_id, await rails.moveState(stamped, 'Sent', null, tx))
  })
  return await rails.getTransfer(transfer_id)
}

export async function failPayout(transfer_id: string, reason: string): Promise<Transfer> {
  await rails.markFailed(transfer_id, reason)
  return await rails.getTransfer(transfer_id)
}

export async function payTo(user_id: string): Promise<PayTo[]> {
  const links = await bankLinks.listForUser(user_id)
  const missing = links.filter((link) => link.payment_method_id === null)
  if (missing.length === 0) return links.map(payToOf)

  const account = missing[0] as BankLink
  const offered = await attempt('moov.paymentMethods', async () =>
    moov.rails().paymentMethods(account.moov_account_id)
  )
  if (!offered || offered.length === 0) return links.map(payToOf)

  for (const link of missing) {
    const found = offered.find((method) => method.lastFourAccountNumber === link.last_four)
    if (!found) continue
    await withTransaction(async (tx) => {
      await bankLinks.update(link.id, { payment_method_id: found.paymentMethodID }, tx)
    })
  }
  return (await bankLinks.listForUser(user_id)).map(payToOf)
}

const payToOf = (link: BankLink): PayTo => PayToShape.parse(link)

export async function getPayout(transfer_id: string): Promise<Transfer> {
  return assertKind(await rails.getTransfer(transfer_id), 'payout')
}
