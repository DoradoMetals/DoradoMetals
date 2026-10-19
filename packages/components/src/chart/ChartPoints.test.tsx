import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

vi.mock('react-chartjs-2', () => {
  const Stub = (props: { data: { datasets: { pointRadius: unknown }[] } }) => (
    <canvas data-testid="chart" data-points={JSON.stringify(props.data.datasets[0]?.pointRadius)} />
  )
  return { Line: Stub, Bar: Stub, Doughnut: Stub }
})

import { LineChart } from './Chart'

describe('LineChart points', () => {
  it('Show points reaches the rendered chart (1102:10)', () => {
    const { getByTestId, rerender } = render(
      <LineChart
        labels={['a', 'b', 'c']}
        series={[{ label: 'Gold', data: [1, 2, 3] }]}
        label="Gold"
        points
      />
    )
    expect(getByTestId('chart').getAttribute('data-points')).toBe('[4,4,4]')
    rerender(
      <LineChart
        labels={['a', 'b', 'c']}
        series={[{ label: 'Gold', data: [1, 2, 3] }]}
        label="Gold"
      />
    )
    expect(getByTestId('chart').getAttribute('data-points')).toBe('[0,0,4]')
  })
})
