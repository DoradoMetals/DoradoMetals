import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Alert } from './Alert'
import { axeViolations } from '../test/axe'

describe('Alert', () => {
  it('renders title and body with a status role, and axe finds nothing', async () => {
    const { container, getByText } = render(
      <Alert intent="danger" title="Payment failed">
        Your card was declined.
      </Alert>
    )
    expect(getByText('Payment failed')).toBeTruthy()
    expect(getByText('Your card was declined.')).toBeTruthy()
    expect(container.querySelector('[role="alert"], [role="status"]')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('icon={false} suppresses the intent icon', () => {
    const { container } = render(<Alert title="Quiet" icon={false} />)
    expect(container.querySelector('svg')).toBe(null)
  })

  it('the dismiss control centers vertically in the row, not to its top', () => {
    const { getByRole } = render(<Alert title="Heads up" onDismiss={() => {}} />)
    expect(getByRole('button', { name: 'Dismiss' }).className).toMatch(/self-center/)
  })
})
