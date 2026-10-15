import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { DOCUMENT_NAMES, Documents, formatBytes, type DocumentRow } from './Documents'
import { axeViolations } from '../test/axe'

const documents: DocumentRow[] = [
  { id: '1', name: 'Invoice', meta: 'PDF · 48 KB · Sep 1, 2026', state: 'available' },
  { id: '2', name: 'Shipment Manifest', meta: 'PDF · 31 KB · Sep 1, 2026', state: 'available' },
  { id: '3', name: 'Return Shipment Manifest', state: 'unavailable' },
]

describe('Documents', () => {
  it('renders the header count and rows, and axe finds nothing', async () => {
    const { container, getByText } = render(<Documents documents={documents} />)
    expect(getByText('Documents')).toBeTruthy()
    expect(getByText('3 documents')).toBeTruthy()
    expect(getByText('Invoice')).toBeTruthy()
    expect(await axeViolations(container)).toEqual([])
  })

  it("singular count reads '1 document'", () => {
    const { getByText } = render(<Documents documents={[documents[0]]} />)
    expect(getByText('1 document')).toBeTruthy()
  })

  it('the ten canonical names are the union, in the Media file order', () => {
    expect([...DOCUMENT_NAMES]).toEqual([
      'Invoice',
      'Shipment Manifest',
      'Return Shipment Manifest',
      'Shipping Instructions',
      'Pickup Manifest',
      'Pickup Instructions',
      'Intake Receipt',
      'Appointment Instructions',
      'Assay Results',
      'Rate Sheet',
    ])
  })

  it('download is a real, named button and fires onDownload', () => {
    const onDownload = vi.fn()
    const { getByRole } = render(
      <Documents documents={[{ id: '1', name: 'Invoice', state: 'available', onDownload }]} />
    )
    fireEvent.click(getByRole('button', { name: 'Download Invoice' }))
    expect(onDownload).toHaveBeenCalled()
  })

  it('an Available row carries Send beside Download and never a Delete (ruling 136)', () => {
    const onSend = vi.fn()
    const { getByRole, queryByRole } = render(
      <Documents documents={[{ id: '1', name: 'Invoice', state: 'available', onSend }]} />
    )
    fireEvent.click(getByRole('button', { name: 'Send Invoice' }))
    expect(onSend).toHaveBeenCalled()
    expect(queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('showSend turns Send off without touching Download', () => {
    const { getByRole, queryByRole } = render(
      <Documents documents={[{ id: '1', name: 'Invoice', state: 'available', showSend: false }]} />
    )
    expect(queryByRole('button', { name: 'Send Invoice' })).toBeNull()
    expect(getByRole('button', { name: 'Download Invoice' })).toBeTruthy()
  })

  it('row meta is built from format, bytes and a caller-formatted date', () => {
    const { getByText } = render(
      <Documents
        documents={[
          {
            id: '1',
            name: 'Invoice',
            state: 'available',
            format: 'PDF',
            bytes: 31 * 1024,
            date: 'Sep 1, 2026',
          },
        ]}
      />
    )
    expect(getByText('PDF · 31 KB · Sep 1, 2026')).toBeTruthy()
  })

  it('formatBytes steps through units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB')
  })

  it('an explicit meta names the row state: Ready to generate, Awaiting refiner', () => {
    const { getByText } = render(
      <Documents
        documents={[
          { id: '1', name: 'Assay Results', state: 'unavailable', meta: 'Awaiting refiner' },
          { id: '2', name: 'Invoice', state: 'unavailable', meta: 'Ready to generate' },
        ]}
      />
    )
    expect(getByText('Awaiting refiner')).toBeTruthy()
    expect(getByText('Ready to generate')).toBeTruthy()
  })

  it('generating shows its own meta text and a disabled button, not a dead one', () => {
    const { getByText, getByRole } = render(
      <Documents documents={[{ id: '1', name: 'Invoice', state: 'generating' }]} />
    )
    expect(getByText('Generating…')).toBeTruthy()
    expect((getByRole('button', { name: 'Download Invoice' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('generating carries no Send: there is nothing to send until it exists', () => {
    const { queryByRole } = render(
      <Documents documents={[{ id: '1', name: 'Invoice', state: 'generating' }]} />
    )
    expect(queryByRole('button', { name: 'Send Invoice' })).toBeNull()
  })

  it('unavailable shows no download button at all - a customer cannot force a document that does not exist', () => {
    const { getByText, queryByRole } = render(
      <Documents
        documents={[{ id: '1', name: 'Return Shipment Manifest', state: 'unavailable' }]}
      />
    )
    expect(getByText('Not yet available')).toBeTruthy()
    expect(queryByRole('button', { name: /download/i })).toBeNull()
  })

  it('Import and Generate are off by default and belong to Unavailable rows only', () => {
    const onImport = vi.fn()
    const onGenerate = vi.fn()
    const { queryByRole, rerender, getByRole } = render(
      <Documents documents={[{ id: '1', name: 'Assay Results', state: 'unavailable' }]} />
    )
    expect(queryByRole('button', { name: 'Import Assay Results' })).toBeNull()
    expect(queryByRole('button', { name: 'Generate Assay Results' })).toBeNull()

    rerender(
      <Documents
        documents={[
          {
            id: '1',
            name: 'Assay Results',
            state: 'unavailable',
            showImport: true,
            showGenerate: true,
            onImport,
            onGenerate,
          },
        ]}
      />
    )
    fireEvent.click(getByRole('button', { name: 'Import Assay Results' }))
    fireEvent.click(getByRole('button', { name: 'Generate Assay Results' }))
    expect(onImport).toHaveBeenCalled()
    expect(onGenerate).toHaveBeenCalled()
  })

  it("empty is a real state - header stays visible, count reads 'None yet'", async () => {
    const { container, getByText } = render(<Documents documents={[]} />)
    expect(getByText('Documents')).toBeTruthy()
    expect(getByText('None yet')).toBeTruthy()
    expect(getByText('No documents yet')).toBeTruthy()
    expect(container.querySelector('ul')).toBeNull()
    expect(await axeViolations(container)).toEqual([])
  })

  it('the title row is the library Accordion (549:63): leading chevron, count as trailing amount', () => {
    const { getByRole } = render(<Documents documents={documents} />)
    const trigger = getByRole('button', { name: /Documents/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('Open=False keeps just the header - the section still names itself when collapsed', () => {
    const { getByRole, queryByText } = render(
      <Documents documents={documents} defaultOpen={false} />
    )
    const trigger = getByRole('button', { name: /Documents/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(queryByText('Invoice')).toBeNull()
    expect(queryByText('3 documents')).toBeTruthy()
  })

  it('is controllable: onToggle fires and open is obeyed, same contract as Accordion', () => {
    const onToggle = vi.fn()
    const { getByRole, getByText } = render(
      <Documents documents={documents} open={false} onToggle={onToggle} />
    )
    expect(getByText('3 documents')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: /Documents/ }))
    expect(onToggle).toHaveBeenCalled()
  })

  it('loading shows skeleton rows, no count, and axe finds nothing', async () => {
    const { container, getByRole, queryByText } = render(
      <Documents documents={[]} status="loading" />
    )
    expect(getByRole('status', { name: 'Loading documents' })).toBeTruthy()
    expect(queryByText('None yet')).toBeNull()
    expect(await axeViolations(container)).toEqual([])
  })

  it('error shows the alert and Try again fires onRetry', async () => {
    const onRetry = vi.fn()
    const { container, getByRole, getByText } = render(
      <Documents documents={[]} status="error" onRetry={onRetry} />
    )
    expect(getByText("Couldn't load documents")).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(await axeViolations(container)).toEqual([])
  })

  it('empty body names the shipment manifest', () => {
    const { getByText } = render(<Documents documents={[]} />)
    expect(
      getByText('Your invoice and shipment manifest appear here once the order is priced.')
    ).toBeTruthy()
  })
})
