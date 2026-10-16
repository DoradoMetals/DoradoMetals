import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ACTIVITY_LABELS, Activity, activityDetail } from '../Activity'
import { button } from './cardFixtures'
import { activity, names } from './detailFixtures'

describe('Activity (1207:15215)', () => {
  it('Layout=Desktop: When, Who, What, Detail', () => {
    render(<Activity activity={activity} names={names} />)
    for (const header of ['When', 'Who', 'What', 'Detail'])
      expect(screen.getAllByText(header).length).toBeGreaterThan(0)
    expect(screen.getByText('Locked spots')).toBeTruthy()
    expect(screen.getByText('Dana Whitlock')).toBeTruthy()
    expect(screen.getByText('Gold')).toBeTruthy()
    expect(screen.getByText('Placed order')).toBeTruthy()
  })

  it('Layout=Mobile draws cards', () => {
    render(<Activity activity={activity} names={names} layout="mobile" />)
    expect(screen.getByText('Locked spots')).toBeTruthy()
    expect(screen.getByText('Marguerite Whitfield')).toBeTruthy()
  })

  it('empty, loading and error', () => {
    const onRetry = vi.fn()
    const { rerender, container } = render(<Activity activity={[]} names={names} />)
    expect(screen.getByText('No activity yet')).toBeTruthy()
    rerender(<Activity activity={activity} names={names} content="loading" />)
    expect(screen.getByRole('status')).toBeTruthy()
    rerender(<Activity activity={activity} names={names} content="error" onRetry={onRetry} />)
    expect(screen.getByText('Couldn’t load activity')).toBeTruthy()
    fireEvent.click(button(container, 'Try again')!)
    expect(onRetry).toHaveBeenCalled()
  })

  it('activityDetail joins the parts and labels cover every kind', () => {
    expect(
      activityDetail({
        ...activity[0],
        detail: { metal_id: 'Gold', rail: 'ACH', state: 'not_sent', override_reason: 'because' },
      } as never)
    ).toBe('Gold · ACH · Not sent · because')
    expect(activityDetail({ ...activity[1] })).toBe('')
    expect(Object.keys(ACTIVITY_LABELS).length).toBeGreaterThan(10)
  })
})
