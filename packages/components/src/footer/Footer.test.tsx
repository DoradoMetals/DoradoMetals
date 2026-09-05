import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Footer } from './Footer'
import { axeViolations } from '../test/axe'

function renderFooter(props: Partial<React.ComponentProps<typeof Footer>> = {}) {
  return render(
    <Footer
      brand={<a href="/">Dorado</a>}
      tagline="Fast. Insured. Paid the day it arrives."
      cta={<button type="button">Get a Quote</button>}
      columns={[
        {
          heading: 'Resources',
          links: [
            <a key="a" href="/why">
              Why Dorado?
            </a>,
          ],
        },
        {
          heading: 'Company',
          links: [
            <a key="b" href="/about">
              About Us
            </a>,
          ],
        },
      ]}
      legal="© Dorado Metals Exchange LLC 2026"
      legalLinks={[
        <a key="terms" href="/terms">
          Terms
        </a>,
      ]}
      social={<a href="https://instagram.com">Instagram</a>}
      {...props}
    />
  )
}

describe('Footer', () => {
  it("renders every column's heading and links, and axe finds nothing", async () => {
    const { container, getByText } = renderFooter()
    expect(getByText('Resources')).toBeTruthy()
    expect(getByText('Why Dorado?')).toBeTruthy()
    expect(getByText('Company')).toBeTruthy()
    expect(getByText('About Us')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it('renders the tagline, cta and legal text', () => {
    const { getByText } = renderFooter()
    expect(getByText('Fast. Insured. Paid the day it arrives.')).toBeTruthy()
    expect(getByText('Get a Quote')).toBeTruthy()
    expect(getByText('© Dorado Metals Exchange LLC 2026')).toBeTruthy()
  })

  it('legalLinks are desktop-only and social is mobile-only, by class', () => {
    const { getByText, getAllByText } = renderFooter()
    const wraps = getAllByText('Terms').map((el) => el.parentElement!.className)
    expect(wraps.some((c) => c.includes('hidden') && c.includes('lg:flex'))).toBe(true)
    expect(wraps.some((c) => c.includes('lg:hidden'))).toBe(true)

    const socialWrap = getByText('Instagram').parentElement!
    expect(socialWrap.className).toContain('lg:hidden')
  })

  it('omits the legalLinks and social wrappers entirely when not given', () => {
    const { queryByText } = renderFooter({ legalLinks: undefined, social: undefined })
    expect(queryByText('Terms')).toBeNull()
    expect(queryByText('Instagram')).toBeNull()
  })
})
