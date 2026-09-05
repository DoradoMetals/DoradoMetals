import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { Upload } from './Upload'
import { axeViolations } from '../test/axe'

describe('Upload', () => {
  it('holds a real file input, and axe finds nothing', async () => {
    const { container } = render(<Upload onFiles={() => {}} accept="image/*" />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.getAttribute('accept')).toBe('image/*')
    expect(await axeViolations(container)).toEqual([])
  })

  it('picking files calls onFiles', () => {
    const onFiles = vi.fn()
    const { container } = render(<Upload onFiles={onFiles} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFiles).toHaveBeenCalled()
    expect(onFiles.mock.calls[0][0][0].name).toBe('photo.jpg')
  })

  it('drag-over is a visible state that clears on leave', () => {
    const { container } = render(<Upload onFiles={() => {}} />)
    const zone = container.querySelector('label') as HTMLElement
    fireEvent.dragOver(zone)
    expect(zone.getAttribute('data-drag-over')).toBe('true')
    fireEvent.dragLeave(zone)
    expect(zone.getAttribute('data-drag-over')).toBe(null)
  })

  it('the file band is always present, even with nothing attached', () => {
    const { getByText } = render(<Upload onFiles={() => {}} />)
    expect(getByText('No files added yet')).toBeTruthy()
  })
})

describe('Upload uploaded state', () => {
  it('attachments render OUTSIDE the picker label, prompt stays constant', () => {
    const { container, getByText } = render(
      <Upload onFiles={() => {}} attachments={<div data-testid="att">receipt.pdf</div>} />
    )
    const label = container.querySelector('label')!
    const att = container.querySelector('[data-testid="att"]')!
    expect(label.contains(att)).toBe(false)
    expect(getByText(/Drag files here or/)).toBeTruthy()
  })
})

describe('Upload full state', () => {
  it('blocks picking and shows the ceiling once fileCount reaches maxFiles', () => {
    const { container, getByText } = render(
      <Upload onFiles={() => {}} maxFiles={2} fileCount={2} attachments={<div>a</div>} />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(getByText('Maximum files reached')).toBeTruthy()
    expect(getByText('2 of 2')).toBeTruthy()
  })
})

describe('Upload error state', () => {
  it('shows the reason in place of the formats line', () => {
    const { getByText } = render(
      <Upload
        onFiles={() => {}}
        error={{ reason: 'size', title: 'File too large', remedy: 'Choose a file under 25MB' }}
      />
    )
    expect(getByText('File too large')).toBeTruthy()
    expect(getByText('Choose a file under 25MB')).toBeTruthy()
  })
})

describe('Upload clear all', () => {
  it('fires onClearAll from the footer', () => {
    const onClearAll = vi.fn()
    const { getByRole } = render(
      <Upload onFiles={() => {}} maxFiles={3} fileCount={1} onClearAll={onClearAll} />
    )
    fireEvent.click(getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).toHaveBeenCalled()
  })
})
