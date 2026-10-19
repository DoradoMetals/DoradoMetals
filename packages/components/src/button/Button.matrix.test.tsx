import { describe, expect, it, vi } from 'vitest'
import { Plus } from '@dorado/icons'

import { Button, type ButtonEmphasis, type ButtonIntent } from './Button'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const variants: ButtonEmphasis[] = ['primary', 'secondary', 'tertiary', 'subtle']
const intents: ButtonIntent[] = ['neutral', 'success', 'danger', 'warning', 'info']
const sizes = ['xs', 'sm', 'default', 'lg', 'xl'] as const
const iconSizes = ['icon', 'iconSm', 'iconXs', 'iconInline'] as const

describe('Button state matrix', () => {
  it('every variant, intent and text size renders a named button', async () => {
    const { container, getAllByRole } = setup(
      <div>
        {variants.flatMap((variant) =>
          intents.flatMap((intent) =>
            sizes.map((size) => (
              <Button
                key={`${variant}-${intent}-${size}`}
                variant={variant}
                intent={intent}
                size={size}
              >
                {`${variant} ${intent} ${size}`}
              </Button>
            ))
          )
        )}
      </div>
    )
    expect(getAllByRole('button')).toHaveLength(variants.length * intents.length * sizes.length)
    await expectNoAxeViolations(container)
  })

  it('every icon size renders a labelled icon button, disabled or not', async () => {
    const { container, getAllByRole } = setup(
      <div>
        {iconSizes.flatMap((size) =>
          [false, true].map((disabled) => (
            <Button
              key={`${size}-${disabled}`}
              size={size}
              variant="tertiary"
              aria-label={`Add ${size}`}
              disabled={disabled}
            >
              <Plus aria-hidden />
            </Button>
          ))
        )}
      </div>
    )
    expect(getAllByRole('button', { name: /Add/ })).toHaveLength(iconSizes.length * 2)
    await expectNoAxeViolations(container)
  })

  it('the default button keeps its class list', () => {
    const { getByRole } = setup(<Button>Sell</Button>)
    expect(classList(getByRole('button'))).toMatchInlineSnapshot(`
      [
        "[&_svg]:pointer-events-none",
        "[&_svg]:shrink-0",
        "[&_svg]:size-4",
        "bg-primary",
        "border",
        "border-transparent",
        "cursor-pointer",
        "disabled:opacity-50",
        "disabled:pointer-events-none",
        "focus-ring",
        "font-medium",
        "gap-2xs-plus",
        "hit-area",
        "hover:opacity-85",
        "inline-flex",
        "items-center",
        "justify-center",
        "min-h-(--control-md)",
        "px-md",
        "relative",
        "rounded-lg",
        "text-primary-foreground",
        "text-small",
        "transition-[color,background-color,border-color,opacity]",
        "whitespace-nowrap",
      ]
    `)
  })
})

describe('Button behaviour', () => {
  it('Enter and Space click it; a disabled button ignores both and the pointer', async () => {
    const onClick = vi.fn()
    const { user, getByRole, rerender } = setup(<Button onClick={onClick}>Sell</Button>)
    await user.tab()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    await user.click(getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(3)
    rerender(
      <Button onClick={onClick} disabled>
        Sell
      </Button>
    )
    await user.click(getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('submits its form only when typed submit', async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())
    const { user, getByRole } = setup(
      <form aria-label="Sell" onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button type="button">Plain</Button>
        <Button type="submit">Send</Button>
      </form>
    )
    await user.click(getByRole('button', { name: 'Plain' }))
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(getByRole('button', { name: 'Send' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('asChild renders the child element in place of a button', () => {
    const { getByRole, queryByRole } = setup(
      <Button asChild variant="secondary">
        <a href="#sell">Sell</a>
      </Button>
    )
    expect(getByRole('link', { name: 'Sell' }).getAttribute('href')).toBe('#sell')
    expect(queryByRole('button')).toBeNull()
  })

  it('an icon sits left by default and right on request, with the stroke for its size', () => {
    const { getByRole, rerender } = setup(
      <Button icon={Plus} size="lg">
        Add
      </Button>
    )
    const button = getByRole('button')
    expect(button.firstElementChild!.tagName.toLowerCase()).toBe('svg')
    expect(button.firstElementChild!.getAttribute('stroke-width')).toBe(String((2 * 20) / 24))
    rerender(
      <Button icon={Plus} iconPlacement="right" iconStrokeWidth={3} iconSize={12}>
        Add
      </Button>
    )
    const icon = getByRole('button').lastElementChild!
    expect(icon.tagName.toLowerCase()).toBe('svg')
    expect(icon.getAttribute('stroke-width')).toBe('3')
    expect(icon.getAttribute('width')).toBe('12')
  })

  it('a long label renders whole', () => {
    const long = 'Sell everything in the vault right now '.repeat(4).trim()
    const { getByRole } = setup(<Button hitArea={false}>{long}</Button>)
    expect(getByRole('button', { name: long }).textContent).toBe(long)
  })
})
