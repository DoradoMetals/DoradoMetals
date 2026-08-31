// The library Accordion, tested through the app's adapter - the six call
// sites' contract AND the hallmarks the Figma drawing has no axis for.
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccordionSection from '@/shared/ui/AccordionSection'
import { Accordion } from '@dorado/components'

describe('the accordion is a disclosure, not a styled div', () => {
  test('the header is a real button wired to its panel', async () => {
    render(<AccordionSection label="Gold Coins">rows</AccordionSection>)
    const button = screen.getByRole('button', { name: /gold coins/i })
    expect(button.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    // Open, the panel is a labelled region and the trigger points at it.
    // (aria-controls is only asserted open: Radix unmounts closed content,
    // and an id referencing nothing would be the lie.)
    const region = screen.getByRole('region', { name: /gold coins/i })
    expect(button.getAttribute('aria-controls')).toBe(region.id)
  })

  test('a closed panel is UNMOUNTED - collapsed means gone, not merely small', () => {
    // Stronger than the inert the first implementation used: Radix removes
    // closed content from the DOM entirely, so there is nothing to tab into
    // and nothing for a screen reader to stumble on.
    render(
      <AccordionSection label="Fees">
        <button type="button">inside</button>
      </AccordionSection>
    )
    expect(screen.queryByText('inside')).toBeNull()
  })

  test('controlled open renders the region without a click', () => {
    render(
      <AccordionSection label="Totals" open onToggle={() => {}}>
        rows
      </AccordionSection>
    )
    expect(
      screen.getByRole('button', { name: /totals/i }).getAttribute('aria-expanded')
    ).toBe('true')
    expect(screen.getByRole('region', { name: /totals/i })).toBeTruthy()
  })

  test('a negative total renders the minus the fees rows rely on', () => {
    render(
      <AccordionSection label="Fees" total={12.5} negative>
        rows
      </AccordionSection>
    )
    expect(screen.getByRole('button', { name: /fees/i }).textContent).toContain('-')
  })
})

describe('the library component stands alone', () => {
  test('disabled is a real disabled, not a class', () => {
    render(
      <Accordion label="Locked" disabled>
        rows
      </Accordion>
    )
    expect(
      (screen.getByRole('button', { name: /locked/i }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  test('the trailing slot takes any node, not a number', () => {
    render(
      <Accordion label="Gold" trailing={<em>custom</em>} open onToggle={() => {}}>
        rows
      </Accordion>
    )
    expect(screen.getByText('custom')).toBeTruthy()
  })
})
