import withTransaction from '#shared/db/withTransaction.ts'
import * as disputes from '#db/orders/purity-disputes/repo.ts'
import * as orderLots from '#db/orders/lots/repo.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as lotsRepo from '#db/inventory/lots/repo.ts'
import * as rules from '#orders/disputes/rules.ts'
import type {
  PurityDispute,
  PurityDisputeOpenBody,
  PurityDisputeResolveBody,
} from '@dorado/contracts'

export async function forOrder(order_id: string): Promise<PurityDispute[]> {
  return await disputes.forOrder(order_id)
}

export async function open(
  order_lot_id: string,
  body: PurityDisputeOpenBody
): Promise<PurityDispute> {
  const link = await orderLots.getOne(order_lot_id)
  rules.assertOrderLot(link, order_lot_id)
  rules.assertPurchase(await ordersRepo.directionOf(link.order_id), order_lot_id)
  const lot = await lotsRepo.getOne(link.lot_id)
  rules.assertOrderLot(lot, order_lot_id)

  return await withTransaction(async (tx) => {
    rules.assertNoOpenDispute(await disputes.openForLot(link.lot_id, tx), link.lot_id)
    return await disputes.create(
      {
        order_id: link.order_id,
        lot_id: link.lot_id,
        our_purity: lot.purity,
        claimed_purity: body.claimed_purity,
        claim_source: body.claim_source ?? null,
        reason: body.reason,
      },
      tx
    )
  })
}

export async function resolve(id: string, body: PurityDisputeResolveBody): Promise<PurityDispute> {
  const dispute = await disputes.getOne(id)
  rules.assertDispute(dispute, id)
  rules.assertOpen(dispute)

  const written = await withTransaction((tx) => disputes.resolve(id, body.resolution, tx))
  rules.assertResolved(written, id)
  return written
}
