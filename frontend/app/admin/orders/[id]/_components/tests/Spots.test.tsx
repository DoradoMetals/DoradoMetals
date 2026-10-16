import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Spots } from '../Spots'
import { action, spot } from './detailFixtures'

const spots = [spot('Gold', 2411.2, 2431.5), spot('Silver', 29.14, 29.9)]

describe('Spots', () => {
  test('Spots=Unlocked, Open: one read-only input per order metal and a lock button', () => {
    const onLock = vi.fn()
    render(
      <Spots
        direction="purchase"
        spots={spots}
        locked={false}
        actions={[action('lock_spots')]}
        onLock={onLock}
      />
    )
    const gold = screen.getByLabelText('Gold') as HTMLInputElement
    expect(gold.value).toBe('2,411.2')
    expect(gold.readOnly).toBe(true)
    expect(screen.queryByLabelText('Platinum')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Lock spots' }))
    expect(onLock).toHaveBeenCalled()
  })

  test('the lock button is off when actions[] does not offer it', () => {
    render(
      <Spots direction="purchase" spots={spots} locked={false} actions={[]} onLock={() => {}} />
    )
    expect(screen.getByRole('button', { name: 'Lock spots' })).toHaveProperty('disabled', true)
  })

  test('Spots=Locked: unlock, and the frozen bid is editable when edit_spots is offered', () => {
    const onUnlock = vi.fn()
    const onSpotChange = vi.fn()
    render(
      <Spots
        direction="purchase"
        spots={spots}
        locked
        actions={[action('unlock_spots'), action('edit_spots')]}
        onUnlock={onUnlock}
        onSpotChange={onSpotChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Unlock spots' }))
    expect(onUnlock).toHaveBeenCalled()
    const silver = screen.getByLabelText('Silver')
    fireEvent.change(silver, { target: { value: '30.01' } })
    fireEvent.blur(silver)
    expect(onSpotChange).toHaveBeenCalledWith('Silver', 30.01)
  })

  test('a sale shows the ask', () => {
    render(<Spots direction="sale" spots={spots} locked actions={[]} />)
    expect((screen.getByLabelText('Gold') as HTMLInputElement).value).toBe('2,431.5')
  })

  test('Open=False reads Unlocked or Locked', () => {
    const { unmount } = render(
      <Spots direction="purchase" spots={spots} locked={false} actions={[]} defaultOpen={false} />
    )
    expect(screen.getByText('Unlocked')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Lock spots' })).toBeNull()
    unmount()
    render(<Spots direction="purchase" spots={spots} locked actions={[]} defaultOpen={false} />)
    expect(screen.getByText('Locked')).toBeTruthy()
  })

  test('Spots / Mobile lays the metals out two by two', () => {
    const { container } = render(
      <Spots direction="purchase" spots={spots} locked={false} actions={[]} layout="mobile" />
    )
    expect(container.querySelector('[data-locked], .grid-cols-2')).toBeTruthy()
  })

  test('Content=Empty, Loading and Error', () => {
    const onRetry = vi.fn()
    const { unmount } = render(
      <Spots direction="purchase" spots={[]} locked={false} actions={[]} />
    )
    expect(screen.getByText('No spot prices yet')).toBeTruthy()
    unmount()
    const second = render(
      <Spots direction="purchase" spots={undefined} locked={false} actions={[]} content="loading" />
    )
    expect(screen.getByRole('status', { name: 'Loading spots' })).toBeTruthy()
    second.unmount()
    render(
      <Spots
        direction="purchase"
        spots={undefined}
        locked={false}
        actions={[]}
        content="error"
        onRetry={onRetry}
      />
    )
    expect(screen.getByText('Couldn’t load spots')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
