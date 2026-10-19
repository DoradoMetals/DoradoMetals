import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { getPaginationItems, Pagination } from './Pagination'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

function Harness({ pageCount, start = 1 }: { pageCount: number; start?: number }) {
  const [page, setPage] = React.useState(start)
  return <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
}

const current = (getByRole: (role: string, options: { current: string }) => HTMLElement) =>
  getByRole('button', { current: 'page' }).textContent

describe('Pagination state matrix', () => {
  it.each([
    ['one page', 1, 1],
    ['first of many', 1, 20],
    ['middle of many', 10, 20],
    ['last of many', 20, 20],
    ['zero pages', 1, 0],
    ['negative page', -3, 5],
    ['page past the end', 99, 5],
    ['fractional', 2.7, 4.9],
  ])('%s renders and axe finds nothing', async (_name, page, pageCount) => {
    const { container } = setup(
      <Pagination page={page} pageCount={pageCount} onPageChange={() => {}} />
    )
    expect(container.querySelector('nav')).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default nav keeps its class list', () => {
    const { getByRole } = setup(<Pagination page={1} pageCount={3} onPageChange={() => {}} />)
    expect(classList(getByRole('navigation'))).toMatchInlineSnapshot(`
      [
        "flex",
        "gap-2xs",
        "items-center",
      ]
    `)
  })
})

describe('Pagination behaviour', () => {
  it('controlled: the page prop wins and the callback reports the request', async () => {
    const onPageChange = vi.fn()
    const { user, getByRole } = setup(
      <Pagination page={2} pageCount={5} onPageChange={onPageChange} />
    )
    await user.click(getByRole('button', { name: 'Next page' }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    await user.click(getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenLastCalledWith(1)
    await user.click(getByRole('button', { name: 'Page 5' }))
    expect(onPageChange).toHaveBeenLastCalledWith(5)
    expect(current(getByRole)).toBe('2')
  })

  it('walks the pages from the keyboard with Tab, Enter and Space', async () => {
    const { user, getByRole } = setup(<Harness pageCount={4} />)
    await user.tab()
    expect(document.activeElement).toBe(getByRole('button', { name: 'Page 1' }))
    await user.tab()
    await user.keyboard('{Enter}')
    expect(current(getByRole)).toBe('2')
    getByRole('button', { name: 'Next page' }).focus()
    await user.keyboard(' ')
    expect(current(getByRole)).toBe('3')
    await user.keyboard(' ')
    expect(current(getByRole)).toBe('4')
    expect(getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
  })

  it('clamps an out-of-range page and still reports a valid neighbour', async () => {
    const onPageChange = vi.fn()
    const { user, getByRole } = setup(
      <Pagination page={99} pageCount={5} onPageChange={onPageChange} />
    )
    expect(current(getByRole)).toBe('5')
    await user.click(getByRole('button', { name: 'Previous page' }))
    expect(onPageChange).toHaveBeenCalledWith(4)
  })

  it('zero pages draws one page with both arrows off', () => {
    const { getByRole, getAllByRole } = setup(
      <Pagination page={1} pageCount={0} onPageChange={() => {}} />
    )
    expect(getAllByRole('button', { name: /^Page/ })).toHaveLength(1)
    expect(getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)
    expect(getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true)
  })

  it('many pages keep seven slots at most, with ellipses hidden from readers', () => {
    expect(getPaginationItems(50, 100)).toEqual([1, 'ellipsis', 49, 50, 51, 'ellipsis', 100])
    expect(getPaginationItems(2, 100)).toEqual([1, 2, 3, 'ellipsis', 100])
    expect(getPaginationItems(1, 2)).toEqual([1, 2])
    const { container } = setup(<Pagination page={50} pageCount={100} onPageChange={() => {}} />)
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(2)
  })
})
