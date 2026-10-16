import withTransaction from '#shared/db/withTransaction.ts'
import * as claims from '#db/shipping/claims/repo.ts'
import * as shipments from '#db/shipping/shipments/repo.ts'
import * as rules from '#logistics/shipping/claims/rules.ts'
import type { Executor } from '#shared/db/executor.ts'
import type {
  ShipmentClaimOpenBody,
  ShipmentClaimPatchBody,
  ShipmentClaimView,
} from '@dorado/contracts'

export async function open(
  shipment_id: string,
  body: ShipmentClaimOpenBody
): Promise<ShipmentClaimView> {
  return await withTransaction(async (tx) => {
    rules.requireShipment(await shipments.getOne(shipment_id, tx), shipment_id)
    rules.refuseSecondOpenClaim(await claims.listFor(shipment_id, tx))
    return await claims.create(
      {
        shipment_id,
        kind: body.kind,
        amount: body.amount,
        carrier_claim_number: body.carrier_claim_number ?? null,
        note: body.note ?? null,
      },
      tx
    )
  })
}

export async function patch(
  shipment_id: string,
  claim_id: string,
  body: ShipmentClaimPatchBody
): Promise<ShipmentClaimView> {
  return await withTransaction(async (tx) => {
    const claim = rules.requireClaimOn(await claims.getOne(claim_id, tx), shipment_id, claim_id)
    const others = await claims.listFor(shipment_id, tx)
    await claims.update(claim_id, rules.resolvePatch(claim, body, others), tx)
    return rules.requireClaimOn(await claims.getOne(claim_id, tx), shipment_id, claim_id)
  })
}

export async function forShipment(
  shipment_id: string,
  executor?: Executor
): Promise<ShipmentClaimView[]> {
  rules.requireShipment(await shipments.getOne(shipment_id, executor), shipment_id)
  return await claims.listFor(shipment_id, executor)
}

export async function forOrder(
  order_id: string,
  executor?: Executor
): Promise<ShipmentClaimView[]> {
  return await claims.listForOrder(order_id, executor)
}
