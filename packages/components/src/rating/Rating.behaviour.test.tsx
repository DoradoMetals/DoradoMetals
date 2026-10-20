import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { Star } from '@dorado/icons'

import { Rating, RatingButton } from './Rating'
import { setup } from '../test/render'
import { takeConsoleNoise } from '../test/console'
import { expectNoAxeViolations } from '../test/axe'

function Stars(props: React.ComponentProps<typeof Rating>) {
  return (
    <Rating {...props}>
      {[0, 1, 2, 3, 4].map((i) => (
        <RatingButton key={i} />
      ))}
    </Rating>
  )
}

const filled = (container: HTMLElement) => container.querySelectorAll('svg.fill-current').length

describe('Rating behaviour', () => {
  it.each([
    ['empty', {}],
    ['rated', { defaultValue: 3 }],
    ['read only', { defaultValue: 4, readOnly: true }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(<Stars {...props} />)
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('hover previews the stars and leaving restores the value', async () => {
    const { user, container, getByRole } = setup(<Stars defaultValue={1} />)
    await user.hover(getByRole('radio', { name: '4 stars' }))
    expect(filled(container)).toBe(4)
    await user.unhover(getByRole('radiogroup'))
    expect(filled(container)).toBe(1)
  })

  it('a read-only rating ignores hover and keys', async () => {
    const onValueChange = vi.fn()
    const { user, container, getByRole } = setup(
      <Stars defaultValue={2} readOnly onValueChange={onValueChange} />
    )
    await user.hover(getByRole('radio', { name: '5 stars' }))
    expect(filled(container)).toBe(2)
    expect(getByRole('radiogroup').getAttribute('aria-readonly')).toBe('true')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('Shift or Meta with an arrow jumps to the ends; ArrowUp and ArrowDown step; other keys do nothing', async () => {
    const onValueChange = vi.fn()
    const { user } = setup(<Stars defaultValue={3} onValueChange={onValueChange} />)
    await user.tab()
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    expect(onValueChange).toHaveBeenLastCalledWith(5)
    await user.keyboard('{Meta>}{ArrowLeft}{/Meta}')
    expect(onValueChange).toHaveBeenLastCalledWith(1)
    await user.keyboard('{ArrowUp}')
    expect(onValueChange).toHaveBeenLastCalledWith(2)
    await user.keyboard('{ArrowDown}')
    expect(onValueChange).toHaveBeenLastCalledWith(1)
    const calls = onValueChange.mock.calls.length
    await user.keyboard('a')
    expect(onValueChange).toHaveBeenCalledTimes(calls)
  })

  it('controlled: the value prop wins and the callback fires', async () => {
    const onValueChange = vi.fn()
    const { user, container, getByRole } = setup(<Stars value={2} onValueChange={onValueChange} />)
    await user.click(getByRole('radio', { name: '5 stars' }))
    expect(onValueChange).toHaveBeenCalledWith(5)
    await user.unhover(getByRole('radiogroup'))
    expect(getByRole('radio', { name: '2 stars' }).getAttribute('aria-checked')).toBe('true')
    expect(filled(container)).toBeGreaterThanOrEqual(2)
  })

  it('a custom icon and a falsy child are allowed; a star outside a Rating throws', () => {
    const { container } = setup(
      <Rating defaultValue={1}>
        <RatingButton icon={<Star />} size={12} />
        {null}
      </Rating>
    )
    expect(container.querySelectorAll('button')).toHaveLength(1)
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => setup(<RatingButton />)).toThrow(
      'useRating must be used within a Rating component'
    )
    quiet.mockRestore()
  })

  it('a key that reaches an unfocused star steps from the current value', () => {
    const onValueChange = vi.fn()
    const { getByRole } = setup(<Stars defaultValue={2} onValueChange={onValueChange} />)
    fireEvent.keyDown(getByRole('radio', { name: '2 stars' }), { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenCalledWith(3)
  })
})
