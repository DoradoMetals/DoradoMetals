import type { Action } from '@dorado/contracts'

export type OrderAction = Action & { enabled?: boolean }

export const ORDER_ACTIONS = {
  editLots: 'edit_lots',
  addLot: 'add_lot',
  combineLots: 'combine_lots',
  removeLots: 'remove_lots',
  allocateLot: 'supply',
  adoptAssay: 'adopt_assay',
  lockSpots: 'lock_spots',
  unlockSpots: 'unlock_spots',
  editSpots: 'edit_spots',
  editCharges: 'edit_charges',
  editPayoutMethod: 'edit_payout_method',
  openClaim: 'open_claim',
  updateClaim: 'update_claim',
  openDispute: 'open_dispute',
  reassay: 'reassay',
  resolveDispute: 'resolve_dispute',
} as const

export const findAction = (
  actions: readonly OrderAction[] | undefined,
  name: string
): OrderAction | undefined => actions?.find((action) => action.name === name)

export const offers = (actions: readonly OrderAction[] | undefined, name: string): boolean => {
  const action = findAction(actions, name)
  return action != null && action.enabled !== false
}
