import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { BarChart, DonutChart, LineChart, Sparkline } from './Chart'

describe('Charts', () => {
  it('every chart renders a canvas with role=img and a name', () => {
    const { container } = render(
      <div>
        <LineChart
          labels={['a', 'b']}
          series={[{ label: 'Gold', data: [1, 2] }]}
          label="Gold price"
        />
        <BarChart labels={['a']} series={[{ label: 'Vol', data: [3] }]} label="Volume" />
        <DonutChart labels={['Au', 'Ag']} data={[60, 40]} label="Mix" />
        <Sparkline data={[1, 3, 2]} label="Trend" />
      </div>
    )
    const canvases = container.querySelectorAll('canvas[role="img"]')
    expect(canvases.length).toBe(4)
    for (const c of canvases) expect(c.getAttribute('aria-label')).toBeTruthy()
  })

  it('title renders the card chrome and a visible heading (57:36/57:60)', () => {
    const { getByText, container } = render(
      <BarChart
        labels={['Jan', 'Feb']}
        series={[{ label: 'Payouts', data: [1, 2] }]}
        label="Payouts by month"
        title="Payouts by month"
      />
    )
    const heading = getByText('Payouts by month', { selector: 'h3' })
    expect(heading.className).toContain('text-h5')
    expect(container.querySelector('.bg-card.border-border')).toBeTruthy()
  })

  it('omitting title renders the bare canvas with no card chrome', () => {
    const { container, queryByRole } = render(
      <LineChart labels={['a']} series={[{ label: 'Gold', data: [1] }]} label="Gold price" />
    )
    expect(queryByRole('heading')).toBeNull()
    expect(container.querySelector('.bg-card.border-border')).toBeNull()
  })
})
