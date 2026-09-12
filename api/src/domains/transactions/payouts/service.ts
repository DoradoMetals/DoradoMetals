import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import { orders, paymentTransfers as transfers, bankLinks, refiningOrders } from '#db'
import * as moov from '#providers/moov/index.ts'
import * as rails from '#transactions/rails/service.ts'
import {
  assertKind,
  assertOpenable,
  assertPayable,
  assertOneOrder,
  assertRail,
  assertSendable,
  assertTransfer,
  assertWalletMethod,
  assertWritten,
  centsOf,
  openingState,
  referenceFor,
  refiningReferenceFor,
  transferKeyFor,
} from '#transactions/rails/rules.ts'
import { PayTo as PayToShape } from '@dorado/contracts'
import type { BankLink, OpenPayoutBody, PayTo, Transfer } from '@dorado/contracts'

const MOOV = 'moov'
const MANUAL = 'manual'

export async function openPayout(body: OpenPayoutBody): Promise<Transfer> {
  assertOneOrder(body.order_id, body.refining_order_id)
  assertRail(body.rail, 'payout')
  if (body.refining_order_id) return await openRefiningPayout(body, body.refining_order_id)
  return await withTransaction(async (tx) => {
    const order = await orders.getOne(body.order_id as string, tx)
    const owed = assertOpenable(body.order_id as string, order?.totals?.total)

    const created = await transfers.create(
      {
        order_id: body.order_id as string,
        refining_order_id: null,
        kind: 'payout',
        rail: body.rail,
        state: openingState('payout'),
        amount: owed,
        counterparty_user_id: order?.user_id ?? null,
        details_id: body.details_id ?? order?.totals?.payout_details_id ?? null,
        bank_link_id: body.bank_link_id ?? null,
        provider: null,
        provider_ref: null,
        reference: referenceFor(order?.direction ?? null, order?.number ?? 0),
        idempotency_key: null,
      },
      tx
    )
    if (created) return created
    return assertTransfer(
      body.order_id as string,
      await transfers.getForOrder(body.order_id as string, 'payout', tx)
    )
  })
}

// A refiner is paid the way a customer is. What it owes comes off
// `refining.order_money`, so the Payment card and the Totals card cannot
// disagree about the figure (GAP 12).
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

// The ROW is written first and the provider is called after the commit: a
// crash between them leaves a Processing payout with no provider reference,
// which the operator can see, rather than a sent payment nothing recorded.
export async function sendPayout(transfer_id: string): Promise<Transfer> {
  const opened = assertSendable(
    assertKind(assertTransfer(transfer_id, await transfers.getOne(transfer_id)), 'payout')
  )
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

// A wire leaves through the bank's own portal, so the only thing the API can
// record is that a human sent it and what reference they used.
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

// The "Pay to" select: one SQL read of the links we hold, and one provider
// read for any link whose Moov payment method we have not cached on the row.
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
