'use client'

import * as d3 from 'd3'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import { FeatureCollection, Geometry } from 'geojson'
import { useEffect, useRef } from 'react'
import { stateTaxData, StateTaxDetail } from '@/features/sales-tax/types'

type USMapProps = {
  selected: StateTaxDetail | null
  setSelected: React.Dispatch<React.SetStateAction<StateTaxDetail | null>>
}

export default function USMap({ selected, setSelected }: USMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // 1) INITIAL DRAW: only once
  useEffect(() => {
    const width = 960
    const height = 600
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const projection = d3
      .geoAlbersUsa()
      .scale(1000)
      .translate([width / 2, height / 2])
    const path = d3.geoPath().projection(projection)

    d3.json('https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json').then((us: any) => {
      const geo = feature(
        us as Topology,
        (us as Topology).objects.states
      ) as FeatureCollection<Geometry>
      const states = geo.features

      svg
        .selectAll('path')
        .data(states)
        .join('path')
        .attr('d', path)
        .attr('stroke', (_d) => 'var(--neutral-400)')
        .attr('fill', (_d) => 'var(--card)')
        .attr('class', 'cursor-pointer')
        .on('click', (_e, d: any) => {
          const fips = String(d.id).padStart(2, '0')
          const detail = stateTaxData[fips] ?? null
          setSelected((prev) => (prev?.fips === fips ? null : detail))
        })
    })
  }, [])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll<SVGPathElement, any>('path').attr('fill', (d) => {
      const fips = String(d.id).padStart(2, '0')
      return selected?.fips === fips ? 'url(#goldGradientCustom)' : 'var(--card)'
    })
  }, [selected])

  return (
    <div className="w-full max-w-[700px] mx-auto">
      <svg
        ref={svgRef}
        viewBox="0 0 960 600"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', touchAction: 'manipulation' }}
      >
        <defs>
          <linearGradient id="goldGradientCustom" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#AE8625" />
            <stop offset="25%" stopColor="#F5D67D" />
            <stop offset="50%" stopColor="#D2AC47" />
            <stop offset="75%" stopColor="#EDC967" />
            <stop offset="100%" stopColor="#AE8625" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
