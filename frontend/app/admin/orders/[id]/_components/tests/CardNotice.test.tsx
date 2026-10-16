import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { CardNotice } from '../../../_components/CardNotice'

describe('CardNotice (1235:15715)', () => {
  test('Kind=Stale reads the changed-order copy and Reload calls back', () => {
    const onReload = vi.fn()
    render(<CardNotice kind="stale" onReload={onReload} />)
    expect(screen.getByText('This order changed since you opened it.')).toBeTruthy()
    expect(
      screen.getByText('Someone else saved a change. Reload to see it before you edit.')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onReload).toHaveBeenCalled()
  })

  test('Kind=Error reads the failed-save copy and Try again calls back', () => {
    const onRetry = vi.fn()
    render(<CardNotice kind="error" layout="mobile" onRetry={onRetry} />)
    expect(screen.getByText('Couldn’t save your change.')).toBeTruthy()
    expect(screen.getByText('Check your connection, then try again.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
