import { describe, expect, it, vi } from 'vitest'

import { Documents, formatBytes, type DocumentRow, type DocumentsProps } from './Documents'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const rows: DocumentRow[] = [
  { id: '1', name: 'Invoice', state: 'available', format: 'PDF', bytes: 2048, date: 'Oct 1' },
  { id: '2', name: 'Assay Results', state: 'generating' },
  { id: '3', name: 'Rate Sheet', state: 'unavailable', showGenerate: true, showImport: true },
]

describe('Documents state matrix', () => {
  it.each([
    ['rows', {}],
    ['one row', { documents: [rows[0]!] }],
    ['empty', { documents: [] }],
    ['loading', { status: 'loading' as const }],
    ['error', { status: 'error' as const, onRetry: () => {} }],
    ['closed', { defaultOpen: false }],
  ])('%s renders and axe finds nothing', async (_name, props: Partial<DocumentsProps>) => {
    const { container } = setup(<Documents documents={rows} {...props} />)
    expect(container.firstElementChild).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default list keeps its class list', () => {
    const { getByRole } = setup(<Documents documents={rows} />)
    expect(classList(getByRole('list'))).toMatchInlineSnapshot(`
      [
        "divide-border",
        "divide-y",
        "flex",
        "flex-col",
        "py-2xs",
        "w-full",
      ]
    `)
  })
})

describe('Documents behaviour', () => {
  it('row actions fire by pointer and in Tab order', async () => {
    const handlers = {
      onSend: vi.fn(),
      onDownload: vi.fn(),
      onGenerate: vi.fn(),
      onImport: vi.fn(),
    }
    const docs: DocumentRow[] = [
      { ...rows[0]!, onSend: handlers.onSend, onDownload: handlers.onDownload },
      { ...rows[2]!, onGenerate: handlers.onGenerate, onImport: handlers.onImport },
    ]
    const { user, getByRole } = setup(<Documents documents={docs} />)
    getByRole('button', { name: /Documents/ }).focus()
    const order: string[] = []
    for (let i = 0; i < 4; i++) {
      await user.tab()
      order.push(document.activeElement!.getAttribute('aria-label') ?? '')
      await user.keyboard('{Enter}')
    }
    expect(order).toEqual([
      'Send Invoice',
      'Download Invoice',
      'Generate Rate Sheet',
      'Import Rate Sheet',
    ])
    for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledTimes(1)
  })

  it('a generating download ignores the pointer', async () => {
    const onDownload = vi.fn()
    const { user, getByRole } = setup(<Documents documents={[{ ...rows[1]!, onDownload }]} />)
    await user.click(getByRole('button', { name: 'Download Assay Results' }))
    expect(onDownload).not.toHaveBeenCalled()
  })

  it('the header toggles from the keyboard; controlled open wins', async () => {
    const onToggle = vi.fn()
    const { user, getByRole, queryByRole, unmount } = setup(<Documents documents={rows} />)
    getByRole('button', { name: /Documents/ }).focus()
    await user.keyboard('{Enter}')
    expect(queryByRole('list')).toBeNull()
    await user.keyboard(' ')
    expect(getByRole('list')).toBeTruthy()
    unmount()
    const held = setup(<Documents documents={rows} open onToggle={onToggle} />)
    await held.user.click(held.getByRole('button', { name: /Documents/ }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(held.getByRole('list')).toBeTruthy()
  })

  it('a row with no format, size or date draws no meta line', () => {
    const { getByText } = setup(
      <Documents documents={[{ id: 'x', name: 'Invoice', state: 'available', format: '' }]} />
    )
    expect(getByText('Invoice').nextElementSibling).toBeNull()
  })

  it('many rows all render and the header counts them', () => {
    const many: DocumentRow[] = Array.from({ length: 50 }, (_, index) => ({
      id: String(index),
      name: 'Invoice',
      state: 'available',
    }))
    const { getByRole, getByText } = setup(<Documents documents={many} />)
    expect(getByRole('list').children).toHaveLength(50)
    expect(getByText('50 documents')).toBeTruthy()
  })
})

describe('formatBytes edges', () => {
  it('reads zero, the unit edges and caps at GB', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB')
    expect(formatBytes(5 * 1024 ** 4)).toBe('5120 GB')
  })
})
