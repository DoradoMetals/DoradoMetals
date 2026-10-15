export const ACTION_LABELS: Record<string, string> = {
  cancel: 'Cancel',
  reopen: 'Reopen',
  finalize: 'Finalize',
  add_funds: 'Add funds',
  send_payment: 'Send payment',
  supply: 'Supply',
  refining_sale: 'Sell to refiner',
  buy_label: 'Buy label',
  ship: 'Ship',
  update_tracking: 'Update tracking',
  edit_lots: 'Edit lots',
  assign_lots: 'Assign lots',
  lock_spots: 'Lock spots',
  unlock_spots: 'Unlock spots',
}

export const BATCH_ACTION = 'assign_lots'

export const actionLabel = (name: string): string =>
  ACTION_LABELS[name] ?? name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export const sharedByAll = (
  offers: readonly (readonly { name: string }[])[],
  name: string
): boolean =>
  offers.length > 0 && offers.every((actions) => actions.some((action) => action.name === name))
