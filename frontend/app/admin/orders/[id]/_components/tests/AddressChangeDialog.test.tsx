import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import * as React from 'react'

import { AddressChangeDialog } from '../AddressChangeDialog'
import { button, buttonsIn, dialog } from './cardFixtures'

describe('AddressChangeDialog (1209:15597)', () => {
  it('desktop: names the voided label, Keep address then Change and relabel', () => {
    const onConfirm = vi.fn()
    render(
      <AddressChangeDialog
        open
        trackingLabel="FedEx 7731 2290 0144"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )
    expect(screen.getByText('Change the ship-to address?')).toBeTruthy()
    expect(dialog()!.textContent).toContain(
      'Voids the label and relabels. FedEx 7731 2290 0144 stops working and a new label is bought for the new address.'
    )
    expect(buttonsIn(dialog()!)).toEqual(['Keep address', 'Change and relabel', 'Close'])
    fireEvent.click(button(dialog()!, 'Change and relabel')!)
    expect(onConfirm).toHaveBeenCalled()
  })

  it('mobile stacks the footer', () => {
    render(
      <AddressChangeDialog
        open
        layout="mobile"
        trackingLabel="FedEx 7731"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    )
    expect(dialog()!.querySelector('.flex-col-reverse')).toBeTruthy()
  })
})
