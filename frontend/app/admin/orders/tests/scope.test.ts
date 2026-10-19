import { describe, expect, test } from 'vitest'

import { fromParams } from '../_components/OrdersScreen'
import { IN_PROGRESS, chooseShow, chooseState, requestStates } from '../_lib/scope'

describe('the orders scope from the URL', () => {
  const p = (q: string) => new URLSearchParams(q)
  test('?state=Completed with the default Show loads with Show = All', () => {
    expect(fromParams(p('state=Completed'))).toEqual({ state: 'Completed', show: 'all' })
  })
  test('no params is the default', () => {
    expect(fromParams(p(''))).toEqual({ state: 'all', show: 'in_progress' })
  })
})

describe('the orders scope', () => {
  test('the default asks for the in-progress states', () => {
    expect(requestStates({ state: 'all', show: 'in_progress' })).toEqual(IN_PROGRESS)
  })
  test('the All chip widens Show to All and asks for every state', () => {
    const next = chooseState({ state: 'all', show: 'in_progress' }, 'all')
    expect(next).toEqual({ state: 'all', show: 'all' })
    expect(requestStates(next)).toBeNull()
  })
  test('Completed and Cancelled widen Show to All', () => {
    expect(chooseState({ state: 'all', show: 'in_progress' }, 'Completed')).toEqual({
      state: 'Completed',
      show: 'all',
    })
    expect(chooseState({ state: 'all', show: 'in_progress' }, 'Cancelled').show).toBe('all')
  })
  test('an in-progress chip leaves Show alone', () => {
    expect(chooseState({ state: 'all', show: 'unassigned' }, IN_PROGRESS[0]!).show).toBe(
      'unassigned'
    )
  })
  test('Show = In progress takes a closed chip back to All', () => {
    expect(chooseShow({ state: 'Completed', show: 'all' }, 'in_progress')).toEqual({
      state: 'all',
      show: 'in_progress',
    })
    expect(chooseShow({ state: IN_PROGRESS[0]!, show: 'all' }, 'in_progress').state).toBe(
      IN_PROGRESS[0]
    )
  })
})
