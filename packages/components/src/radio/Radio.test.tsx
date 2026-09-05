import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Radio, RadioGroup, RadioOption } from './Radio'
import { axeViolations } from '../test/axe'

describe('Radio', () => {
  it('is a real radio group that selects on click, and axe finds nothing', async () => {
    const onValueChange = vi.fn()
    const { getByRole, getAllByRole, container } = render(
      <RadioGroup onValueChange={onValueChange} aria-label="Purity">
        <Radio value="14k" aria-label="14 Karat" />
        <Radio value="18k" aria-label="18 Karat" />
      </RadioGroup>
    )
    const radios = getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios[0].getAttribute('aria-checked')).toBe('false')
    fireEvent.click(getByRole('radio', { name: '18 Karat' }))
    expect(onValueChange).toHaveBeenCalledWith('18k')
    expect(await axeViolations(container)).toEqual([])
  })

  it('disabled is real', () => {
    const { getByRole } = render(
      <RadioGroup aria-label="Purity">
        <Radio value="14k" aria-label="x" disabled />
      </RadioGroup>
    )
    expect((getByRole('radio') as HTMLButtonElement).disabled).toBe(true)
  })

  it("rest state matches the drawing's own border and fill, and is a circle", () => {
    const { getByRole } = render(
      <RadioGroup aria-label="Purity">
        <Radio value="14k" aria-label="x" />
      </RadioGroup>
    )
    const radio = getByRole('radio')
    expect(radio.className).toMatch(/\bborder-border\b/)
    expect(radio.className).toMatch(/\bbg-card\b/)
    expect(radio.className).toMatch(/\brounded-full\b/)
  })

  it('selected reads by a primary border, not by a filled control', () => {
    const { getByRole } = render(
      <RadioGroup value="14k" aria-label="Purity">
        <Radio value="14k" aria-label="x" />
      </RadioGroup>
    )
    const radio = getByRole('radio')
    expect(radio.className).toMatch(/data-\[state=checked\]:border-primary/)
    expect(radio.className).not.toMatch(/data-\[state=checked\]:bg-primary/)
  })

  it('disabled unselected is a flat muted fill, not a translucent one', () => {
    const { getByRole } = render(
      <RadioGroup aria-label="Purity">
        <Radio value="14k" aria-label="x" disabled />
      </RadioGroup>
    )
    const radio = getByRole('radio')
    expect(radio.className).toMatch(/disabled:data-\[state=unchecked\]:bg-muted/)
    expect(radio.className).not.toMatch(/disabled:opacity-50/)
  })
})

describe('RadioOption', () => {
  it('is a real radio that selects on click anywhere in the option, and axe finds nothing', async () => {
    const onValueChange = vi.fn()
    const { getByText, getByRole, container } = render(
      <RadioGroup onValueChange={onValueChange} aria-label="Package" className="flex gap-2">
        <RadioOption value="grams" variant="tile">
          Grams
        </RadioOption>
        <RadioOption value="ounces" variant="tile">
          Ounces
        </RadioOption>
      </RadioGroup>
    )
    fireEvent.click(getByText('Ounces'))
    expect(onValueChange).toHaveBeenCalledWith('ounces')
    expect(getByRole('radio', { name: 'Ounces' }).getAttribute('aria-checked')).toBe('true')
    expect(await axeViolations(container)).toEqual([])
  })

  it('card shows its indicator by default; tile, chip and segment do not', () => {
    const { container: cardContainer } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="card">
          Card
        </RadioOption>
      </RadioGroup>
    )
    expect(cardContainer.querySelectorAll('[aria-hidden]').length).toBe(1)

    const { container: tileContainer } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="tile">
          Tile
        </RadioOption>
      </RadioGroup>
    )
    expect(tileContainer.querySelectorAll('[aria-hidden]').length).toBe(0)

    const { container: chipContainer } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="chip">
          Chip
        </RadioOption>
      </RadioGroup>
    )
    expect(chipContainer.querySelectorAll('[aria-hidden]').length).toBe(0)

    const { container: segmentContainer } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="segment">
          Segment
        </RadioOption>
      </RadioGroup>
    )
    expect(segmentContainer.querySelectorAll('[aria-hidden]').length).toBe(0)
  })

  it('showRadio overrides the per-variant default', () => {
    const { container } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="tile" showRadio>
          Tile
        </RadioOption>
      </RadioGroup>
    )
    expect(container.querySelectorAll('[aria-hidden]').length).toBe(1)
  })

  it('disabled option is inert and dimmed, not styled away', () => {
    const { getByRole } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="tile" disabled>
          Tile
        </RadioOption>
      </RadioGroup>
    )
    const option = getByRole('radio') as HTMLButtonElement
    expect(option.disabled).toBe(true)
    expect(option.className).toMatch(/disabled:opacity-50/)
  })

  it('segment rest state is a flat muted fill, not a bordered card', () => {
    const { getByRole } = render(
      <RadioGroup aria-label="x">
        <RadioOption value="a" variant="segment">
          Segment
        </RadioOption>
      </RadioGroup>
    )
    const option = getByRole('radio')
    expect(option.className).toMatch(/\bbg-muted\b/)
    expect(option.className).toMatch(/\bborder-transparent\b/)
  })

  it("segment reads selection like Tabs' boxed trigger — fill and a neutral border, never a primary ring", () => {
    const { getByRole } = render(
      <RadioGroup value="a" aria-label="x">
        <RadioOption value="a" variant="segment">
          Segment
        </RadioOption>
      </RadioGroup>
    )
    const option = getByRole('radio')
    expect(option.className).toMatch(/data-\[state=checked\]:bg-card/)
    expect(option.className).toMatch(/data-\[state=checked\]:border-border\b/)
    expect(option.className).toMatch(/data-\[state=checked\]:text-foreground/)
    expect(option.className).not.toMatch(/data-\[state=checked\]:border-primary/)
    expect(option.className).not.toMatch(/data-\[state=checked\]:border-\[1\.5px\]/)
  })

  it('segment selects on click and axe finds nothing', async () => {
    const onValueChange = vi.fn()
    const { getByText, getByRole, container } = render(
      <RadioGroup onValueChange={onValueChange} aria-label="View" className="flex gap-1">
        <RadioOption value="grid" variant="segment">
          Grid
        </RadioOption>
        <RadioOption value="list" variant="segment">
          List
        </RadioOption>
      </RadioGroup>
    )
    fireEvent.click(getByText('List'))
    expect(onValueChange).toHaveBeenCalledWith('list')
    expect(getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true')
    expect(await axeViolations(container)).toEqual([])
  })
})
