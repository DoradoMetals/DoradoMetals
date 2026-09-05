import type { Direction } from '@dorado/contracts'

// THE BUTTON'S WORDS, and only its words.
//
// Which statuses an order may be moved to is the server's answer
// (`OrderView.actions.statuses`, decided in api/domain/orders/rules.ts). What
// that move is CALLED on a button is copy, and copy is the client's - so this
// is a lookup over a pair of labels and holds no rule at all.
//
// THE DIRECTION IS AN ARGUMENT because the two ladders disagree about where
// "In Transit" sits: a purchase STARTS there (the customer's metal is on its
// way to the business) and a sale ENDS there. One combined list called a sale
// moving to In Transit a step backwards.
const LADDERS: Record<Direction, readonly string[]> = {
  purchase: ['In Transit', 'Received', 'Payment Processing', 'Completed'],
  sale: ['Pending', 'Preparing', 'In Transit', 'Completed'],
}

export const actionLabel = (
  direction: Direction | null,
  from: string | null,
  to: string
): string => {
  if (to === 'Cancelled') return 'Cancel Order'
  if (from === 'Cancelled') return 'Reopen Order'
  const ladder = LADDERS[direction === 'sale' ? 'sale' : 'purchase']
  const here = ladder.indexOf(from ?? '')
  const there = ladder.indexOf(to)
  const back = here !== -1 && there !== -1 && there < here
  return `${back ? 'Back to' : 'Move to'} ${to}`
}
