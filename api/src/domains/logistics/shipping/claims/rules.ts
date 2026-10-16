import { Conflict, Invalid, NotFound } from '#shared/errors.ts'
import type {
  Shipment,
  ShipmentClaimPatch,
  ShipmentClaimPatchBody,
  ShipmentClaimView,
} from '@dorado/contracts'

export function requireShipment<T extends Pick<Shipment, 'id'>>(
  shipment: T | undefined | null,
  id: string
): T {
  if (!shipment) throw new NotFound(`no shipment ${id}`)
  return shipment
}

export function refuseSecondOpenClaim(claims: Pick<ShipmentClaimView, 'status'>[]): void {
  if (claims.some((c) => c.status === 'Pending')) {
    throw new Conflict('this shipment already has an open claim')
  }
}

export function requireClaimOn(
  claim: ShipmentClaimView | undefined,
  shipment_id: string,
  claim_id: string
): ShipmentClaimView {
  if (!claim || claim.shipment_id !== shipment_id) {
    throw new NotFound(`no claim ${claim_id} on shipment ${shipment_id}`)
  }
  return claim
}

export function resolvePatch(
  claim: ShipmentClaimView,
  body: ShipmentClaimPatchBody,
  others: Pick<ShipmentClaimView, 'id' | 'status'>[]
): ShipmentClaimPatch {
  if (Object.keys(body).length === 0) throw new Invalid('the claim patch has no field')

  const status = body.status ?? claim.status
  if (body.paid_amount != null && status !== 'Paid') {
    throw new Invalid('paid_amount is set only on a Paid claim')
  }

  const patch: ShipmentClaimPatch = { ...body }
  if (body.status && body.status !== claim.status) {
    if (body.status === 'Pending') {
      if (others.some((c) => c.id !== claim.id && c.status === 'Pending')) {
        throw new Conflict('this shipment already has an open claim')
      }
      patch.resolved_at = null
    } else {
      patch.resolved_at = new Date().toISOString()
    }
    if (body.status !== 'Paid' && body.paid_amount === undefined && claim.paid_amount !== null) {
      patch.paid_amount = null
    }
  }
  return patch
}
