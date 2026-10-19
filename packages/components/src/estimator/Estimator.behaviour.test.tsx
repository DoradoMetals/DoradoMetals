import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { waitFor } from '@testing-library/react'

import { Estimator, type EstimatorProps } from './Estimator'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const options = (...labels: string[]) =>
  labels.map((label) => ({ value: label.toLowerCase(), label }))

function Harness(props: Partial<EstimatorProps>) {
  const [type, setType] = React.useState('scrap')
  const [metal, setMetal] = React.useState('gold')
  const [weight, setWeight] = React.useState('')
  const [unit, setUnit] = React.useState('g')
  const [purity, setPurity] = React.useState('14k')
  const [percent, setPercent] = React.useState(58)
  return (
    <Estimator
      type={{ options: options('Scrap', 'Bullion'), value: type, onValueChange: setType }}
      metal={{ options: options('Gold', 'Silver'), value: metal, onValueChange: setMetal }}
      weight={{
        value: weight,
        onValueChange: setWeight,
        unit: { options: options('G', 'Ozt'), value: unit, onValueChange: setUnit },
      }}
      purity={{
        options: options('14K', '18K'),
        value: purity,
        onValueChange: setPurity,
        percent,
        onPercentChange: setPercent,
      }}
      estimate={weight ? `$${weight}` : undefined}
      {...props}
    />
  )
}

describe('Estimator', () => {
  it.each([
    ['desktop', {}],
    ['mobile', { layout: 'mobile' as const }],
    [
      'custom labels',
      {
        eyebrow: 'Add',
        typeLabel: 'Kind',
        weightLabel: <span>Mass</span>,
        purityLabel: <span>Fineness</span>,
      },
    ],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(<Harness {...props} />)
    expect(container.querySelector('[data-layout]')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('typing a weight shows the estimate; chips and the purity slider report', async () => {
    const onAdd = vi.fn()
    const { user, getByRole, getByText } = setup(<Harness onAdd={onAdd} />)
    await user.type(getByRole('textbox', { name: 'Weight' }), '12.5')
    expect(getByText('$12.5')).toBeTruthy()
    await user.click(getByRole('radio', { name: 'Silver' }))
    expect(getByRole('radio', { name: 'Silver' }).getAttribute('aria-checked')).toBe('true')
    await user.click(getByRole('radio', { name: 'Ozt' }))
    expect(getByRole('radio', { name: 'Ozt' }).getAttribute('aria-checked')).toBe('true')
    getByRole('slider', { name: 'Purity' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(getByRole('slider').getAttribute('aria-valuenow')).toBe('59')
    await user.click(getByRole('button', { name: 'Add to estimate' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('a held arrow key moves to and checks the next chip, as Radix checks on arrow focus', async () => {
    const { user, getByRole } = setup(<Harness />)
    getByRole('radio', { name: 'Scrap' }).focus()
    await user.keyboard('{ArrowRight>}')
    await waitFor(() =>
      expect(getByRole('radio', { name: 'Bullion' }).getAttribute('aria-checked')).toBe('true')
    )
    await user.keyboard('{/ArrowRight}')
  })

  it('without a percent handler there is no slider; a rich purity label names it generically', () => {
    const { queryByRole, rerender, getByRole } = setup(
      <Harness purity={{ options: options('14K'), value: '14k' }} />
    )
    expect(queryByRole('slider')).toBeNull()
    rerender(<Harness purityLabel={<b>Fineness</b>} />)
    expect(getByRole('slider', { name: 'Purity percent' })).toBeTruthy()
  })

  it('no estimate draws no estimate slot', () => {
    const { container } = setup(<Harness />)
    expect(container.querySelector('[data-slot="estimate"]')).toBeNull()
  })
})
