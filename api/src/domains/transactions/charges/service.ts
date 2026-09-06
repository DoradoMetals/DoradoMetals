import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import { orders, paymentTransfers as transfers, bankLinks } from '#db'
import * as moov from '#providers/moov/index.ts'
import * as rails from '#transactions/rails/service.ts'
import {
  assertKind,
  assertLink,
  assertOpenable,
  assertPayable,
  assertSendable,
  assertTransfer,
  assertWalletMethod,
  assertWritten,
  centsOf,
  openingState,
  referenceFor,
  transferKeyFor,
} from '#transactions/rails/rules.ts'
import type { OpenChargeBody, Transfer } from '@dorado/contracts'

const MOOV = 'moov'

export async function openCharge(body: OpenChargeBody): Promise<Transfer> {
  return await withTransaction(async (tx) => {
    const order = await orders.getOne(body.order_id, tx)
    const owed = assertOpenable(body.order_id, order?.totals?.post_charges_amount)

    const created = await transfers.create(
      {
        order_id: body.order_id,
        kind: 'charge',
        rail: body.rail,
        state: openingState('charge'),
        amount: owed,
        counterparty_user_id: order?.user_id ?? null,
        details_id: null,
        bank_link_id: null,
        provider: null,
        provider_ref: null,
        reference: referenceFor(order?.direction ?? null, order?.number ?? 0),
        idempotency_key: null,
      },
      tx
    )
    if (created) return created
    return assertTransfer(body.order_id, await transfers.getForOrder(body.order_id, 'charge', tx))
  })
}

// The customer's own bank pushes the money: their linked account is the
// SOURCE and our wallet is the destination. Same machine as a payout, same
// after-commit ordering, opposite direction.
export async function requestCharge(
  transfer_id: string,
  bank_link_id: string
): Promise<Transfer> {
  const opened = assertSendable(
    assertKind(assertTransfer(transfer_id, await transfers.getOne(transfer_id)), 'charge')
  )
  const link = assertPayable(
    opened,
    assertLink(bank_link_id, await bankLinks.getOne(bank_link_id))
  )
  const destination = assertWalletMethod(process.env.MOOV_WALLET_PAYMENT_METHOD_ID)

  await withTransaction(async (tx) => {
    assertWritten(
      transfer_id,
      await transfers.update(
        transfer_id,
        { state: 'Processing', provider: MOOV, bank_link_id: link.id },
        { state: opened.state },
        tx
      )
    )
  })

  const requested = await attempt('moov.createTransfer', async () =>
    moov.rails().createTransfer({
      sourcePaymentMethodID: link.payment_method_id as string,
      destinationPaymentMethodID: destination,
      amountCents: centsOf(opened.amount),
      description: opened.reference ?? transfer_id,
      idempotencyKey: transferKeyFor(transfer_id),
    })
  )

  if (!requested) {
    await rails.markFailed(transfer_id, 'the provider did not accept the charge')
    return await rails.getTransfer(transfer_id)
  }

  await withTransaction(async (tx) => {
    const current = assertTransfer(transfer_id, await transfers.getOne(transfer_id, tx))
    await rails.markProcessing(current, requested.transferID, tx)
  })
  return await rails.getTransfer(transfer_id)
}

export async function failCharge(transfer_id: string, reason: string): Promise<Transfer> {
  await rails.markFailed(transfer_id, reason)
  return await rails.getTransfer(transfer_id)
}

export async function getCharge(transfer_id: string): Promise<Transfer> {
  return assertKind(await rails.getTransfer(transfer_id), 'charge')
}
