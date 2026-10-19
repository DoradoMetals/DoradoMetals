import { describe, expect, it } from 'vitest'

import { Marquee } from './Marquee'
import { MarqueeItem } from './MarqueeItem'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const items = (
  <>
    <MarqueeItem label="Gold" value="$2,411.20" move="+12.10" delta="+0.5%" trend="up" />
    <MarqueeItem label="Silver" value="$28.10" move="-0.20" delta="-0.7%" trend="down" />
    <MarqueeItem label="Platinum" value="$990.00" />
  </>
)

describe('Marquee state matrix', () => {
  it.each([
    ['mobile', {}],
    ['mobile without borders', { showBorders: false }],
    ['desktop', { layout: 'desktop' as const, label: 'Live spot prices' }],
    [
      'desktop with leading control',
      {
        layout: 'desktop' as const,
        label: 'Spot',
        leading: <button type="button">Show bid</button>,
      },
    ],
    ['desktop without borders', { layout: 'desktop' as const, label: 'Spot', showBorders: false }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(
      <Marquee label="Spot" {...props}>
        {items}
      </Marquee>
    )
    expect(container.querySelector('section')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default band keeps its class list', () => {
    const { container } = setup(<Marquee>{items}</Marquee>)
    expect(classList(container.querySelector('section'))).toMatchInlineSnapshot(`
      [
        "bg-background",
        "border-border",
        "border-y",
        "flex",
        "group",
        "h-(--control-lg)",
        "items-center",
        "motion-safe:overflow-hidden",
        "overflow-x-auto",
        "px-lg",
        "w-full",
      ]
    `)
  })

  it('duration sets the speed of both tracks', () => {
    const { container } = setup(<Marquee duration={12}>{items}</Marquee>)
    const tracks = Array.from(container.querySelectorAll<HTMLElement>('section > div'))
    expect(tracks.map((track) => track.style.animationDuration)).toEqual(['12s', '12s'])
  })

  it('a focusable child is reachable by Tab once; the seam copy is hidden from readers', async () => {
    const { user, getAllByRole } = setup(
      <Marquee layout="desktop" label="Spot" leading={<button type="button">Show bid</button>}>
        {items}
      </Marquee>
    )
    await user.tab()
    expect(document.activeElement).toBe(getAllByRole('button', { name: 'Show bid' })[0])
  })

  it('empty children render an empty band', () => {
    const { container } = setup(<Marquee label="Spot">{null}</Marquee>)
    expect(container.querySelector('section')!.textContent).toBe('')
  })
})

describe('MarqueeItem', () => {
  it.each(['up', 'down', 'flat'] as const)('trend %s colours the move and delta', (trend) => {
    const { getByText } = setup(
      <MarqueeItem label="Gold" value="$1" move="+1" delta="+1%" trend={trend} />
    )
    const className = getByText('+1').className
    if (trend === 'up') expect(className).toContain('text-success')
    else if (trend === 'down') expect(className).toContain('text-destructive')
    else expect(className).not.toMatch(/text-(success|destructive)/)
  })

  it('no move and no delta draws no delta group', () => {
    const { container } = setup(<MarqueeItem label="Gold" value="$1" />)
    expect(container.querySelectorAll('span')).toHaveLength(1)
  })

  it('a move or delta of zero still shows 0', () => {
    const { container } = setup(<MarqueeItem label="Gold" value={0} move={0} delta={0} />)
    expect(container.textContent).toBe('Gold000')
  })

  it('a long label and value render whole', () => {
    const long = 'Gold American Eagle one ounce '.repeat(3).trim()
    const { getByText } = setup(<MarqueeItem label={long} value="$2,411.20" />)
    expect(getByText(long)).toBeTruthy()
  })
})
