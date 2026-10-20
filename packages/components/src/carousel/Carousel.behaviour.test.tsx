import { describe, expect, it } from 'vitest'

import { Carousel } from './Carousel'
import { setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const slides = ['One', 'Two', 'Three', 'Four'].map((name) => (
  <button key={name} type="button">
    {name}
  </button>
))

const current = (getAllByRole: (role: string, options: { name: RegExp }) => HTMLElement[]) =>
  getAllByRole('button', { name: /Go to slide/ }).findIndex(
    (dot) => dot.getAttribute('aria-current') === 'true'
  )

describe('Carousel behaviour', () => {
  it.each([
    ['default', {}],
    ['no arrows or dots', { showArrows: false, showDots: false }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByRole } = setup(
      <Carousel label="Products" {...props}>
        {slides}
      </Carousel>
    )
    expect(getByRole('region', { name: 'Products' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('arrows, Home and End on the region move the page; other keys and keys from a slide do nothing', async () => {
    const { user, getByRole, getAllByRole } = setup(<Carousel label="Products">{slides}</Carousel>)
    getByRole('region', { name: 'Products' }).focus()
    await user.keyboard('{End}')
    expect(current(getAllByRole)).toBe(3)
    await user.keyboard('{ArrowLeft}')
    expect(current(getAllByRole)).toBe(2)
    await user.keyboard('{Home}')
    expect(current(getAllByRole)).toBe(0)
    await user.keyboard('{ArrowLeft}')
    expect(current(getAllByRole)).toBe(0)
    await user.keyboard('a')
    expect(current(getAllByRole)).toBe(0)
    getByRole('button', { name: 'Two' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(current(getAllByRole)).toBe(0)
  })

  it('the arrow buttons step and disable at the ends', async () => {
    const { user, getByRole, getAllByRole } = setup(<Carousel label="Products">{slides}</Carousel>)
    expect(getByRole('button', { name: 'Previous slide' })).toHaveProperty('disabled', true)
    await user.click(getByRole('button', { name: 'Next slide' }))
    expect(current(getAllByRole)).toBe(1)
    await user.click(getByRole('button', { name: 'Previous slide' }))
    expect(current(getAllByRole)).toBe(0)
  })

  it('one slide draws no arrows; no slides draw an empty region', () => {
    const { queryByRole, rerender, getByRole } = setup(
      <Carousel label="Products">{slides[0]}</Carousel>
    )
    expect(queryByRole('button', { name: 'Next slide' })).toBeNull()
    rerender(<Carousel label="Products">{[]}</Carousel>)
    expect(getByRole('region').children).toHaveLength(0)
  })
})
