import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import { orders, paymentTransfers as transfers, bankLinks, refiningOrders } from '#db'
import * as moov from '#providers/moov/index.ts'
import * as rails from '#transactions/rails/service.ts'
import * as rules from '#transactions/charges/rules.ts'
import {
  assertKind,
  assertLink,
  assertOneOrder,
  assertOpenable,
  assertPayable,
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
import type { ChargePatch, OpenChargeBody, Transfer } from '@dorado/contracts'

const MOOV = 'moov'
const MANUAL = 'manual'

export async function openCharge(body: OpenChargeBody): Promise<Transfer> {
  assertOneOrder(body.order_id, body.refining_order_id)
  if (body.refining_order_id) return await openRefiningCharge(body, body.refining_order_id)
  return await withTransaction(async (tx) => {
    const order = await orders.getOne(body.order_id as string, tx)
    const owed = assertOpenable(body.order_id as string, order?.totals?.post_charges_amount)

    const created = await transfers.create(
      {
        order_id: body.order_id as string,
        refining_order_id: null,
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
        override_reason: null,
      },
      tx
    )
    if (created) return created
    return assertTransfer(
      body.order_id as string,
      await transfers.getForOrder(body.order_id as string, 'charge', tx)
    )
  })
}

async function openRefiningCharge(
  body: OpenChargeBody,
  refining_order_id: string
): Promise<Transfer> {
  return await withTransaction(async (tx) => {
    const order = await refiningOrders.view(refining_order_id, tx)
    const owed = assertOpenable(refining_order_id, order?.totals.total)

    const created = await transfers.create(
      {
        order_id: null,
        refining_order_id,
        kind: 'charge',
        rail: body.rail,
        state: openingState('charge'),
        amount: owed,
        counterparty_user_id: null,
        details_id: null,
        bank_link_id: null,
        provider: null,
        provider_ref: null,
        reference: order?.number ?? refiningReferenceFor('sell', 0),
        idempotency_key: null,
        override_reason: null,
      },
      tx
    )
    if (created) return created
    return assertTransfer(
      refining_order_id,
      await transfers.getForRefiningOrder(refining_order_id, 'charge', tx)
    )
  })
}

export async function requestCharge(transfer_id: string, bank_link_id: string): Promise<Transfer> {
  const opened = assertSendable(
    assertKind(assertTransfer(transfer_id, await transfers.getOne(transfer_id)), 'charge')
  )
  const link = assertPayable(opened, assertLink(bank_link_id, await bankLinks.getOne(bank_link_id)))
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

export async function markReceived(transfer_id: string, reference: string): Promise<Transfer> {
  await withTransaction(async (tx) => {
    const current = assertKind(
      assertTransfer(transfer_id, await transfers.getOne(transfer_id, tx)),
      'charge'
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
    assertWritten(transfer_id, await rails.moveState(stamped, 'Received', null, tx))
  })
  return await rails.getTransfer(transfer_id)
}

export async function patchCharge(transfer_id: string, changes: ChargePatch): Promise<Transfer> {
  rules.assertNamesExactlyOneField(changes)
  if (changes.reference !== undefined) return await markReceived(transfer_id, changes.reference)
  return await failCharge(transfer_id, changes.failure_reason as string)
}

export async function getCharge(transfer_id: string): Promise<Transfer> {
  return assertKind(await rails.getTransfer(transfer_id), 'charge')
}
