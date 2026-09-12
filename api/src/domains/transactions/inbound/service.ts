import withTransaction from '#shared/db/withTransaction.ts'
import { paymentInbound as inbound, paymentTransfers as transfers, feedCursors } from '#db'
import * as plaid from '#providers/plaid/index.ts'
import * as rails from '#transactions/rails/service.ts'
import {
  assertFeedToken,
  assertInbound,
  assertMatched,
  assertRecorded,
  assertUnmatched,
  assertWritten,
} from '#transactions/rails/rules.ts'
import type { MoovEvent } from '#providers/moov/types.ts'
import type { PlaidFeedTransaction } from '#providers/plaid/types.ts'
import type { InboundTransaction, MatchCandidate, RecordWireBody } from '@dorado/contracts'

const FEED = 'plaid:truist'

export async function listUnmatched(): Promise<InboundTransaction[]> {
  return await inbound.listUnmatched()
}

export async function candidatesFor(order_id: string): Promise<MatchCandidate[]> {
  return await inbound.candidates(order_id, null)
}

export async function recordWire(body: RecordWireBody): Promise<InboundTransaction> {
  return await withTransaction(async (tx) => {
    const created = await inbound.create(
      {
        source: 'manual',
        external_id: null,
        amount: body.amount,
        occurred_at: body.occurred_at,
        counterparty_name: body.counterparty_name,
        memo: body.memo,
        account_ref: body.account_ref,
      },
      tx
    )
    return assertRecorded('the wire', created)
  })
}

export async function confirmMatch(
  inbound_id: string,
  order_id: string,
  actor_id: string
): Promise<InboundTransaction> {
  return await withTransaction(async (tx) => {
    const row = assertUnmatched(assertInbound(inbound_id, await inbound.getOne(inbound_id, tx)))
    const charge = await transfers.getForOrder(order_id, 'charge', tx)

    assertWritten(
      inbound_id,
      await inbound.update(
        inbound_id,
        {
          state: 'Matched',
          order_id,
          transfer_id: charge?.id ?? null,
          matched_at: new Date().toISOString(),
          matched_by_id: actor_id,
        },
        tx
      )
    )
    if (charge) await rails.moveState(charge, 'Received', null, tx)
    return assertInbound(inbound_id, await inbound.getOne(inbound_id, tx))
  })
}

export async function unmatch(inbound_id: string): Promise<InboundTransaction> {
  return await withTransaction(async (tx) => {
    const row = assertMatched(assertInbound(inbound_id, await inbound.getOne(inbound_id, tx)))
    assertWritten(
      inbound_id,
      await inbound.update(
        inbound_id,
        {
          state: 'Unmatched',
          order_id: null,
          transfer_id: null,
          matched_at: null,
          matched_by_id: null,
        },
        tx
      )
    )
    if (row.transfer_id) {
      await transfers.update(
        row.transfer_id,
        { state: 'Due', completed_at: null },
        { state: 'Received' },
        tx
      )
    }
    return assertInbound(inbound_id, await inbound.getOne(inbound_id, tx))
  })
}

export async function ingestMoovInbound(event: MoovEvent): Promise<InboundTransaction | undefined> {
  if (!event.transferID) return undefined
  return await withTransaction(
    async (tx) =>
      await inbound.create(
        {
          source: 'moov',
          external_id: event.transferID,
          amount: 0,
          occurred_at: event.occurredAt,
          counterparty_name: null,
          memo: event.type,
          account_ref: null,
        },
        tx
      )
  )
}

export async function syncFeed(): Promise<number> {
  const token = assertFeedToken(process.env.PLAID_TRUIST_ACCESS_TOKEN)
  const held = await feedCursors.getOne(FEED)
  const page = await plaid.data().syncTransactions(token, held?.cursor ?? null)

  let written = 0
  for (const entry of page.added) {
    if (!isCredit(entry)) continue
    const created = await withTransaction(
      async (tx) =>
        await inbound.create(
          {
            source: 'plaid',
            external_id: entry.transaction_id,
            amount: Math.abs(entry.amount),
            occurred_at: `${entry.date}T00:00:00.000Z`,
            counterparty_name: entry.merchant_name ?? entry.name,
            memo: entry.name,
            account_ref: entry.account_id,
          },
          tx
        )
    )
    if (created) written += 1
  }

  if (page.next_cursor) {
    await withTransaction(async (tx) => {
      await feedCursors.save(FEED, page.next_cursor, tx)
    })
  }
  return written
}

function isCredit(entry: PlaidFeedTransaction): boolean {
  return entry.amount < 0 && !entry.pending
}
