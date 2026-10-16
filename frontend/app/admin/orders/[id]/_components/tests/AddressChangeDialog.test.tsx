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
        reason="Customer moved"
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
    expect(onConfirm).toHaveBeenCalledWith('Customer moved')
  })

  it('shows the current and new address and refuses to confirm without a reason', () => {
    const onConfirm = vi.fn()
    render(
      <AddressChangeDialog
        open
        trackingLabel="FedEx 7731"
        currentAddress="412 Oak Hollow Dr, Austin, TX 78704"
        newAddress="88 Rainey St, Austin, TX 78701"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    )
    const box = dialog()!
    expect(box.textContent).toContain('Current address')
    expect(box.textContent).toContain('412 Oak Hollow Dr, Austin, TX 78704')
    expect(screen.getByDisplayValue('88 Rainey St, Austin, TX 78701')).toBeTruthy()
    fireEvent.click(button(box, 'Change and relabel')!)
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Customer moved; asked by phone' },
    })
    fireEvent.click(button(box, 'Change and relabel')!)
    expect(onConfirm).toHaveBeenCalledWith('Customer moved; asked by phone')
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
