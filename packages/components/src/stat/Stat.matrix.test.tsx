import { describe, expect, it } from 'vitest'

import { Stat, type StatProps } from './Stat'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const states: [string, Partial<StatProps>][] = [
  ['text value', { value: '$2,411.20' }],
  ['number value', { value: 2411.2 }],
  ['zero', { value: 0 }],
  ['negative', { value: -125.5 }],
  ['small', { value: 10, size: 'small' }],
  ['centered', { value: 10, align: 'center' }],
  ['trend up', { value: 10, trend: { direction: 'up', label: '+2.1%' } }],
  ['trend down', { value: 10, trend: { direction: 'down', label: '-2.1%' } }],
  ['percent format', { value: 0.25, format: { style: 'percent' } }],
]

describe('Stat state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByText } = setup(<Stat label="Gold spot" value="" {...props} />)
    expect(getByText('Gold spot')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default stat keeps its class list', () => {
    const { container } = setup(<Stat label="Gold spot" value="$1" />)
    expect(classList(container.firstElementChild)).toMatchInlineSnapshot(`
      [
        "flex",
        "flex-col",
        "gap-2xs",
        "items-start",
      ]
    `)
  })

  it('a small text value uses the small stat tag; trends colour by direction', () => {
    const { getByText, rerender } = setup(
      <Stat label="Spot" value="$1" size="small" trend={{ direction: 'up', label: 'up' }} />
    )
    expect(getByText('$1').className).toBe('stat-sm')
    expect(getByText('up').className).toContain('text-success')
    rerender(<Stat label="Spot" value="$1" trend={{ direction: 'down', label: 'down' }} />)
    expect(getByText('down').className).toContain('text-destructive')
  })

  it('a null or undefined value renders an empty figure, not a crash', () => {
    const { container, rerender } = setup(<Stat label="Spot" value={null} />)
    expect(container.querySelector('.stat')!.textContent).toBe('')
    rerender(<Stat label="Spot" value={undefined} />)
    expect(container.querySelector('.stat')!.textContent).toBe('')
  })
})
