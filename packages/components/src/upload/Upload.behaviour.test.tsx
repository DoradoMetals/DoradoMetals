import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'

import { Upload, type UploadProps } from './Upload'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const pdf = new File(['%PDF'], 'assay.pdf', { type: 'application/pdf' })
const png = new File(['png'], 'Photo.PNG', { type: 'image/png' })
const txt = new File(['txt'], 'notes.txt', { type: 'text/plain' })

const states: [string, Partial<UploadProps>][] = [
  ['default', {}],
  ['hint', { hint: 'PDF or images up to 10 MB' }],
  ['disabled', { disabled: true }],
  [
    'with files',
    { attachments: [<p key="a">assay.pdf</p>, <p key="b">photo.png</p>], maxFiles: 5 },
  ],
  ['full', { fileCount: 2, maxFiles: 2 }],
  ['error', { error: { reason: 'size', title: 'Too big', remedy: 'Pick a smaller file' } }],
  ['clear all', { onClearAll: () => {}, fileCount: 1 }],
  ['custom icon and prompt', { icon: <span>icon</span>, prompt: 'Drop a scan or' }],
]

const input = (container: HTMLElement) =>
  container.querySelector('input[type="file"]') as HTMLInputElement

describe('Upload state matrix', () => {
  it.each(states)('%s renders and axe finds nothing', async (_name, props) => {
    const { container } = setup(<Upload onFiles={() => {}} {...props} />)
    expect(input(container)).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default card keeps its class list', () => {
    const { container } = setup(<Upload onFiles={() => {}} />)
    expect(classList(container.firstElementChild)).toMatchInlineSnapshot(`
      [
        "bg-card",
        "border",
        "border-border",
        "flex",
        "flex-col",
        "hover:border-border-strong",
        "rounded-xl",
        "transition-colors",
        "w-full",
      ]
    `)
  })
})

describe('Upload behaviour', () => {
  it('picking keeps only accepted files: extensions, wildcards and exact types', async () => {
    const onFiles = vi.fn()
    const { user, container } = setup(<Upload onFiles={onFiles} multiple accept=".pdf, image/*" />)
    await user.upload(input(container), [pdf, png, txt])
    expect(onFiles).toHaveBeenCalledWith([pdf, png])
    onFiles.mockClear()
    const exact = setup(<Upload onFiles={onFiles} multiple accept="text/plain" />)
    await exact.user.upload(input(exact.container), [txt])
    expect(onFiles).toHaveBeenCalledWith([txt])
  })

  it('single mode passes only the first file; nothing accepted passes nothing', async () => {
    const onFiles = vi.fn()
    const { user, container } = setup(<Upload onFiles={onFiles} />)
    await user.upload(input(container), [pdf, png])
    expect(onFiles).toHaveBeenCalledWith([pdf])
    onFiles.mockClear()
    const strict = setup(<Upload onFiles={onFiles} accept=".pdf" />)
    fireEvent.change(input(strict.container), { target: { files: [txt] } })
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('the same file can be picked twice because the input resets', async () => {
    const onFiles = vi.fn()
    const { user, container } = setup(<Upload onFiles={onFiles} />)
    await user.upload(input(container), pdf)
    expect(input(container).value).toBe('')
    await user.upload(input(container), pdf)
    expect(onFiles).toHaveBeenCalledTimes(2)
  })

  it('dropping files takes them, says Drop here while over, and clears after', () => {
    const onFiles = vi.fn()
    const { container, getByText, queryByText } = setup(
      <Upload onFiles={onFiles} multiple hint="PDF only" />
    )
    const zone = container.querySelector('label') as HTMLElement
    fireEvent.dragOver(zone)
    expect(getByText('Drop here!')).toBeTruthy()
    expect(input(container).getAttribute('aria-describedby')).toBeNull()
    fireEvent.drop(zone, { dataTransfer: { files: [pdf, png] } })
    expect(onFiles).toHaveBeenCalledWith([pdf, png])
    expect(queryByText('Drop here!')).toBeNull()
  })

  it('a full or disabled zone ignores drag and drop', () => {
    const onFiles = vi.fn()
    const { container, queryByText, rerender } = setup(
      <Upload onFiles={onFiles} fileCount={1} maxFiles={1} />
    )
    const zone = () => container.querySelector('label') as HTMLElement
    fireEvent.dragOver(zone())
    expect(queryByText('Drop here!')).toBeNull()
    fireEvent.drop(zone(), { dataTransfer: { files: [pdf] } })
    rerender(<Upload onFiles={onFiles} disabled />)
    fireEvent.drop(zone(), { dataTransfer: { files: [pdf] } })
    expect(onFiles).not.toHaveBeenCalled()
    expect(input(container).disabled).toBe(true)
  })

  it('the file input is reachable by Tab and Clear all fires from the keyboard', async () => {
    const onClearAll = vi.fn()
    const { user, container } = setup(
      <Upload onFiles={() => {}} onClearAll={onClearAll} fileCount={1} />
    )
    await user.tab()
    expect(document.activeElement).toBe(input(container))
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onClearAll).toHaveBeenCalledTimes(1)
  })

  it('counts read singular, plural and against a ceiling', () => {
    const { getByRole, rerender } = setup(<Upload onFiles={() => {}} fileCount={1} />)
    expect(getByRole('status').textContent).toBe('1 file')
    rerender(<Upload onFiles={() => {}} fileCount={0} />)
    expect(getByRole('status').textContent).toBe('0 files')
    rerender(<Upload onFiles={() => {}} fileCount={3} maxFiles={10} />)
    expect(getByRole('status').textContent).toBe('3 of 10')
  })

  it('unmounting in the middle of a drag logs nothing', () => {
    const { container, unmount } = setup(<Upload onFiles={() => {}} />)
    fireEvent.dragOver(container.querySelector('label') as HTMLElement)
    unmount()
    expect(container.innerHTML).toBe('')
  })
})
