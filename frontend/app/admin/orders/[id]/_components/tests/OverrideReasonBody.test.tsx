import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { OverrideReasonBody } from '../OverrideReasonBody'

describe('OverrideReasonBody (1088:22538)', () => {
  it('draws Reason, its hint and the step-up line, and reports typing', () => {
    const onReasonChange = vi.fn()
    render(<OverrideReasonBody reason="" onReasonChange={onReasonChange} />)
    expect(screen.getByText('Required · at least 10 characters')).toBeTruthy()
    expect(screen.getByText('You will be asked to re-authenticate before this sends.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'x' } })
    expect(onReasonChange).toHaveBeenCalledWith('x')
  })

  it('hides the step-up line when no step-up follows', () => {
    render(<OverrideReasonBody reason="" onReasonChange={() => {}} stepUp={false} />)
    expect(screen.queryByText('You will be asked to re-authenticate before this sends.')).toBeNull()
  })
})
