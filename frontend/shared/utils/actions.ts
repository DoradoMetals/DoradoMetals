import type { Action } from '@dorado/contracts'

export const findAction = (actions: Action[], name: string): Action | undefined =>
  actions.find((action) => action.name === name)

export const hasAction = (actions: Action[], name: string): boolean =>
  findAction(actions, name) !== undefined
