import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import {
  AreaChart,
  axisScales,
  BarChart,
  DonutChart,
  LineChart,
  Sparkline,
  type ChartDomain,
} from './Chart'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const labels = ['Mon', 'Tue', 'Wed']
const series = [
  { label: 'Gold', data: [10, -2, 0] },
  { label: 'Silver', data: [1, 2, 3] },
]
const domain: ChartDomain = { x: [0, 5, 10], min: 0, max: 10, format: (v) => `${v}h` }

describe('Chart state matrix', () => {
  it.each([
    ['line', <LineChart key="l" label="Spot" labels={labels} series={series} />],
    [
      'line with title, axis, points and domain',
      <LineChart
        key="d"
        label="Spot"
        title="Spot"
        labels={labels}
        series={series}
        yAxis
        yFormat={(v) => `$${v}`}
        domain={domain}
        points
      />,
    ],
    ['area', <AreaChart key="a" label="Spot" labels={labels} series={series} />],
    ['bar', <BarChart key="b" label="Volume" labels={labels} series={series} />],
    ['donut', <DonutChart key="n" label="Mix" labels={labels} data={[50, 30, 0]} />],
    ['sparkline', <Sparkline key="s" label="Trend" data={[1, 3, 2]} />],
    [
      'sparkline with domain',
      <Sparkline key="sd" label="Trend" data={[3, 1, 2]} domain={domain} />,
    ],
    ['empty line', <LineChart key="e" label="Spot" labels={[]} series={[]} />],
  ])('%s renders a labelled image and axe finds nothing', async (_name, chart) => {
    const { container } = setup(chart)
    expect(container.querySelector('[role="img"]')).toBeTruthy()
    await expectNoAxeViolations(container)
  })
})

describe('axisScales', () => {
  it('formats domain x ticks and y ticks through the given callbacks', () => {
    const scales = axisScales(true, (v) => `$${v.toFixed(2)}`, domain)
    expect(scales.x.min).toBe(0)
    expect(scales.x.max).toBe(10)
    const xTick = (scales.x.ticks as { callback?: (v: string | number) => string }).callback
    const yTick = (scales.y.ticks as { callback?: (v: string | number) => string }).callback
    expect(xTick?.('5')).toBe('5h')
    expect(yTick?.(-1.5)).toBe('$-1.50')
    expect(yTick?.(0)).toBe('$0.00')
  })

  it('leaves ticks unformatted without callbacks', () => {
    const scales = axisScales(false)
    expect('callback' in scales.x.ticks).toBe(false)
    expect('callback' in scales.y.ticks).toBe(false)
    expect(scales.y.ticks.display).toBe(false)
  })
})

describe('Chart range control', () => {
  it('controlled: the range prop wins, clicks and arrows report the choice', async () => {
    const onRangeChange = vi.fn()
    const { user, getByRole } = setup(
      <LineChart
        label="Spot"
        title="Spot"
        labels={labels}
        series={series}
        range="1W"
        onRangeChange={onRangeChange}
      />
    )
    await user.click(getByRole('radio', { name: '1Y' }))
    expect(onRangeChange).toHaveBeenLastCalledWith('1Y')
    expect(getByRole('radio', { name: '1W' }).getAttribute('aria-checked')).toBe('true')
    getByRole('radio', { name: '1W' }).focus()
    expect(getByRole('radio', { name: '1W' }).tabIndex).toBe(0)
    await user.keyboard('{ArrowRight}')
    expect(onRangeChange).toHaveBeenLastCalledWith('1M')
    await user.keyboard('{Home}')
    expect(onRangeChange).toHaveBeenLastCalledWith('1D')
  })

  it('through state, custom options move the checked chip', async () => {
    function Harness() {
      const [range, setRange] = React.useState('A')
      return (
        <LineChart
          label="Spot"
          labels={labels}
          series={series}
          range={range}
          onRangeChange={setRange}
          rangeOptions={['A', 'B']}
        />
      )
    }
    const { user, getByRole } = setup(<Harness />)
    await user.click(getByRole('radio', { name: 'B' }))
    expect(getByRole('radio', { name: 'B' }).getAttribute('aria-checked')).toBe('true')
  })
})
