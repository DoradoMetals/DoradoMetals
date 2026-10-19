import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { axisScales, BarChart, DonutChart, LineChart, linePoints, Sparkline } from './Chart'

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

  it('range is a row of 1D/1W/1M/1Y Chips, controlled by value and onChange (57:60 Show range)', () => {
    const onRangeChange = vi.fn()
    const { getByRole } = render(
      <LineChart
        labels={['a', 'b']}
        series={[{ label: 'Gold', data: [1, 2] }]}
        label="Gold price"
        title="Spot price"
        range="1Y"
        onRangeChange={onRangeChange}
      />
    )
    const group = getByRole('radiogroup', { name: 'Range' })
    expect(group.className).toContain('gap-xs')
    const chips = group.querySelectorAll('button')
    expect([...chips].map((c) => c.textContent)).toEqual(['1D', '1W', '1M', '1Y'])
    expect(chips[3].getAttribute('aria-checked')).toBe('true')
    expect(chips[0].getAttribute('aria-checked')).toBe('false')
    fireEvent.click(chips[1])
    expect(onRangeChange).toHaveBeenCalledWith('1W')
  })

  it('range options come from props, and no onRangeChange means no range row', () => {
    const { getByRole, queryByRole, rerender } = render(
      <BarChart
        labels={['a']}
        series={[{ label: 'Vol', data: [3] }]}
        label="Volume"
        range="5Y"
        onRangeChange={() => {}}
        rangeOptions={['1Y', '5Y']}
      />
    )
    expect(getByRole('radiogroup', { name: 'Range' }).querySelectorAll('button').length).toBe(2)
    rerender(<BarChart labels={['a']} series={[{ label: 'Vol', data: [3] }]} label="Volume" />)
    expect(queryByRole('radiogroup', { name: 'Range' })).toBeNull()
  })

  it('yAxis renders without error on line and bar (57:60/57:36 Show y axis)', () => {
    const { container } = render(
      <div>
        <LineChart labels={['a']} series={[{ label: 'G', data: [1] }]} label="G" yAxis />
        <BarChart labels={['a']} series={[{ label: 'V', data: [1] }]} label="V" yAxis />
      </div>
    )
    expect(container.querySelectorAll('canvas[role="img"]').length).toBe(2)
  })

  it('plots stretch to the full width of the chart (57:60)', () => {
    const { container } = render(
      <LineChart labels={['a']} series={[{ label: 'G', data: [1] }]} label="G" title="T" />
    )
    expect(container.querySelector('canvas')!.parentElement!.className).toContain('w-full')
  })

  it('sparkline takes an explicit direction (884:4)', () => {
    const { container } = render(<Sparkline data={[1, 3, 2]} label="Trend" direction="down" />)
    expect(container.querySelector('canvas[role="img"]')).toBeTruthy()
  })

  it('the y axis hugs its labels: chart.js measures it, nothing pins 48 (57:60 Y axis 1036:2548)', () => {
    const shown = { width: 31 }
    axisScales(true).y.afterFit(shown)
    expect(shown.width).toBe(31)
    const hidden = { width: 31 }
    axisScales(false).y.afterFit(hidden)
    expect(hidden.width).toBe(0)
  })

  it('the plot fills its container: a caller-sized chart stretches (57:60 Body FILL)', () => {
    const { container } = render(
      <LineChart
        labels={['a', 'b']}
        series={[
          { label: 'Gold', data: [1, 2] },
          { label: 'Silver', data: [2, 1] },
        ]}
        label="G"
        className="h-80"
      />
    )
    const plot = container.querySelector('canvas')!.parentElement!
    expect(plot.className).toContain('flex-1')
    expect(plot.className).toContain('min-h-50')
  })

  it('Show points draws a Chart Point on every value, ringed in the card, larger on hover (1102:10)', () => {
    const on = linePoints({ points: true, primary: true, count: 3 })
    expect(on.pointRadius).toEqual([4, 4, 4])
    expect(on.pointBorderWidth).toBe(2)
    expect(on.pointHoverRadius).toBe(6)
    const off = linePoints({ points: false, primary: true, count: 3 })
    expect(off.pointRadius).toEqual([0, 0, 4])
    expect(linePoints({ points: false, primary: false, count: 3 }).pointRadius).toBe(0)
  })
})
