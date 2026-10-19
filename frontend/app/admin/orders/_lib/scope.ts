import { OrderState } from '@dorado/contracts'

export type ShowValue = 'in_progress' | 'all' | 'unassigned'
export type StateValue = 'all' | OrderState
export type Scope = { state: StateValue; show: string }

const CLOSED: string[] = ['Completed', 'Cancelled']

export const IN_PROGRESS: OrderState[] = OrderState.options.filter(
  (value) => !CLOSED.includes(value)
)

// The chips and the Show select describe one scope. The All chip, or a closed
// state's chip, widens Show to All; Show = In progress takes a closed chip back
// to All, meaning "all in-progress states".
export function chooseState(scope: Scope, state: StateValue): Scope {
  const widen = state === 'all' || CLOSED.includes(state)
  return { state, show: widen ? 'all' : scope.show }
}

export function chooseShow(scope: Scope, show: string): Scope {
  const closed = CLOSED.includes(scope.state)
  return { show, state: show === 'in_progress' && closed ? 'all' : scope.state }
}

// The states the list request carries; null is every state.
export function requestStates({ state, show }: Scope): OrderState[] | null {
  if (state !== 'all') return [state]
  return show === 'in_progress' ? IN_PROGRESS : null
}
