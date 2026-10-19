import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { Star } from '@dorado/icons'

import { Chip, type ChipProps } from './Chip'
import { Badge } from '../badge/Badge'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const states: [string, Partial<ChipProps>][] = [
  ['default', {}],
  ['selected', { selected: true }],
  ['disabled', { disabled: true }],
  ['icon', { icon: <Star aria-hidden /> }],
  ['avatar', { avatar: <img alt="" src="data:," /> }],
  ['count', { count: 3 }],
  ['count zero', { count: 0 }],
  ['dismissible', { onDismiss: () => {} }],
  ['dismissible disabled', { onDismiss: () => {}, disabled: true }],
]

describe('Chip state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getAllByRole } = setup(<Chip label="Gold" {...props} />)
    expect(getAllByRole('button').length).toBeGreaterThan(0)
    await expectNoAxeViolations(container)
  })

  it('the default chip keeps its class list', () => {
    const { getByRole } = setup(<Chip label="Gold" />)
    expect(classList(getByRole('button'))).toMatchInlineSnapshot(`
      [
        "bg-card",
        "border",
        "border-border",
        "cursor-pointer",
        "disabled:opacity-50",
        "disabled:pointer-events-none",
        "focus-ring",
        "font-medium",
        "gap-2xs",
        "hover:bg-accent",
        "hover:border-border-strong",
        "hover:text-foreground",
        "inline-flex",
        "items-center",
        "min-h-(--control-sm)",
        "px-sm",
        "rounded-full",
        "text-muted-foreground",
        "text-small",
        "transition-colors",
      ]
    `)
  })

  it('a count of zero still shows 0', () => {
    const { getByRole } = setup(<Chip label="Gold" count={0} />)
    expect(getByRole('button').textContent).toBe('Gold0')
  })
})

describe('Chip behaviour', () => {
  it('controlled toggle: selected wins and the click reports', async () => {
    const onClick = vi.fn()
    const { user, getByRole } = setup(<Chip label="Gold" selected={false} onClick={onClick} />)
    await user.click(getByRole('button', { name: 'Gold' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(getByRole('button').getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles from the keyboard through state', async () => {
    function Harness() {
      const [on, setOn] = React.useState(false)
      return <Chip label="Gold" selected={on} onClick={() => setOn(!on)} />
    }
    const { user, getByRole } = setup(<Harness />)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(getByRole('button').getAttribute('aria-pressed')).toBe('true')
    await user.keyboard(' ')
    expect(getByRole('button').getAttribute('aria-pressed')).toBe('false')
  })

  it('dismiss fires alone, not the chip click, by pointer and keyboard', async () => {
    const onClick = vi.fn()
    const onDismiss = vi.fn()
    const { user, getByRole } = setup(<Chip label="Gold" onClick={onClick} onDismiss={onDismiss} />)
    await user.click(getByRole('button', { name: 'Remove Gold' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
    getByRole('button', { name: 'Gold' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(getByRole('button', { name: 'Remove Gold' }))
    await user.keyboard('{Enter}')
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('a rich label names the remove button generically', () => {
    const { getByRole } = setup(<Chip label={<b>Gold</b>} onDismiss={() => {}} />)
    expect(getByRole('button', { name: 'Remove chip' })).toBeTruthy()
  })

  it('as a radio it reports aria-checked, not aria-pressed', () => {
    const { getByRole } = setup(
      <div role="radiogroup" aria-label="Metal">
        <Chip role="radio" label="Gold" selected />
      </div>
    )
    const radio = getByRole('radio', { name: 'Gold' })
    expect(radio.getAttribute('aria-checked')).toBe('true')
    expect(radio.getAttribute('aria-pressed')).toBeNull()
  })

  it('disabled ignores clicks and dismissals', async () => {
    const onClick = vi.fn()
    const onDismiss = vi.fn()
    const { user, getByRole } = setup(
      <Chip label="Gold" disabled onClick={onClick} onDismiss={onDismiss} />
    )
    await user.click(getByRole('button', { name: 'Gold' }))
    await user.click(getByRole('button', { name: 'Remove Gold' }))
    expect(onClick).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })
})

describe('Badge state matrix', () => {
  const variants = ['solid', 'soft', 'outline'] as const
  const intents = ['neutral', 'success', 'danger', 'warning', 'info'] as const
  const sizes = ['sm', 'default', 'lg'] as const

  it('every variant, intent and size renders its text and axe finds nothing', async () => {
    const { container, getAllByText } = setup(
      <div>
        {variants.flatMap((variant) =>
          intents.flatMap((intent) =>
            sizes.map((size) => (
              <Badge
                key={`${variant}-${intent}-${size}`}
                variant={variant}
                intent={intent}
                size={size}
                icon={<Star aria-hidden />}
              >
                Paid
              </Badge>
            ))
          )
        )}
      </div>
    )
    expect(getAllByText('Paid')).toHaveLength(variants.length * intents.length * sizes.length)
    await expectNoAxeViolations(container)
  })

  it('the default badge keeps its class list', () => {
    const { getByText } = setup(<Badge>Paid</Badge>)
    expect(classList(getByText('Paid'))).toMatchInlineSnapshot(`
      [
        "[&_svg]:shrink-0",
        "[&_svg]:size-3",
        "bg-surface-soft",
        "font-medium",
        "gap-2xs",
        "inline-flex",
        "items-center",
        "px-xs",
        "py-3xs",
        "rounded-md",
        "text-foreground",
        "text-micro",
        "whitespace-nowrap",
      ]
    `)
  })

  it('renders zero, negative numbers and empty children', () => {
    const { container } = setup(
      <div>
        <Badge>{0}</Badge>
        <Badge>{-4}</Badge>
        <Badge />
      </div>
    )
    expect(Array.from(container.querySelectorAll('span')).map((el) => el.textContent)).toEqual([
      '0',
      '-4',
      '',
    ])
  })
})
