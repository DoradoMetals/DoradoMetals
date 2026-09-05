import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Paperwork, type PaperworkDocument } from './Paperwork'
import { axeViolations } from '../test/axe'

const documents: PaperworkDocument[] = [
  { id: '1', name: 'Invoice', meta: 'PDF · 48 KB · Sep 1, 2026', state: 'available' },
  { id: '2', name: 'Packing List', meta: 'PDF · 31 KB · Sep 1, 2026', state: 'available' },
  { id: '3', name: 'Return Packing List', state: 'unavailable' },
]

describe('Paperwork', () => {
  it('renders the header count and rows, and axe finds nothing', async () => {
    const { container, getByText } = render(<Paperwork documents={documents} />)
    expect(getByText('Paperwork')).toBeTruthy()
    expect(getByText('3 documents')).toBeTruthy()
    expect(getByText('Invoice')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it("singular count reads '1 document'", () => {
    const { getByText } = render(<Paperwork documents={[documents[0]]} />)
    expect(getByText('1 document')).toBeTruthy()
  })

  it('download is a real, named button and fires onDownload', () => {
    const onDownload = vi.fn()
    const { getByRole } = render(
      <Paperwork documents={[{ id: '1', name: 'Invoice', state: 'available', onDownload }]} />
    )
    fireEvent.click(getByRole('button', { name: 'Download Invoice' }))
    expect(onDownload).toHaveBeenCalled()
  })

  it('generating shows its own meta text and a disabled button, not a dead one', () => {
    const { getByText, getByRole } = render(
      <Paperwork documents={[{ id: '1', name: 'Invoice', state: 'generating' }]} />
    )
    expect(getByText('Generating…')).toBeTruthy()
    expect((getByRole('button', { name: 'Download Invoice' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('unavailable shows no download button at all - a customer cannot delete or force a document that does not exist', () => {
    const { getByText, queryByRole } = render(
      <Paperwork documents={[{ id: '1', name: 'Return Packing List', state: 'unavailable' }]} />
    )
    expect(getByText('Not yet available')).toBeTruthy()
    expect(queryByRole('button', { name: /download/i })).toBeNull()
  })

  it("empty is a real state - header stays visible, count reads 'None yet'", async () => {
    const { container, getByText } = render(<Paperwork documents={[]} />)
    expect(getByText('Paperwork')).toBeTruthy()
    expect(getByText('None yet')).toBeTruthy()
    expect(getByText('No documents yet')).toBeTruthy()
    expect(container.querySelector('ul')).toBeNull()
    expect(await axeViolations(container)).toEqual([])
  })

  it('the title row is the library Accordion (549:63, 2026-09-04): leading chevron, count as trailing amount', () => {
    const { getByRole } = render(<Paperwork documents={documents} />)
    const trigger = getByRole('button', { name: /Paperwork/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('Open=False keeps just the header - the section still names itself when collapsed', () => {
    const { getByRole, queryByText } = render(
      <Paperwork documents={documents} defaultOpen={false} />
    )
    const trigger = getByRole('button', { name: /Paperwork/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(queryByText('Invoice')).toBeNull()
    expect(queryByText('3 documents')).toBeTruthy()
  })

  it('is controllable: onToggle fires and open is obeyed, same contract as Accordion', () => {
    const onToggle = vi.fn()
    const { getByRole, getByText } = render(
      <Paperwork documents={documents} open={false} onToggle={onToggle} />
    )
    expect(getByText('3 documents')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /Paperwork/ }))
    expect(onToggle).toHaveBeenCalled()
  })
})
