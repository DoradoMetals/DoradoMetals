// The Upload/Attachment pair through the app's face - and the library
// hallmarks the drawings cannot express.
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Attachment, Upload } from '@dorado/components'

describe('Upload is a real file input wearing a dropzone', () => {
  test('picking a file through the input fires onFiles', () => {
    const onFiles = vi.fn()
    const { container } = render(<Upload onFiles={onFiles} accept="image/*" />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const f = new File(['x'], 'chain.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [f] } })
    expect(onFiles).toHaveBeenCalledWith([f])
  })

  test('a drop is filtered by accept - drag cannot smuggle in what browse refuses', () => {
    const onFiles = vi.fn()
    const { container } = render(<Upload onFiles={onFiles} accept="image/*" />)
    const zone = container.querySelector('label') as HTMLElement
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    fireEvent.drop(zone, { dataTransfer: { files: [pdf] } })
    expect(onFiles).not.toHaveBeenCalled()

    const jpg = new File(['x'], 'chain.jpg', { type: 'image/jpeg' })
    fireEvent.drop(zone, { dataTransfer: { files: [jpg, pdf] } })
    expect(onFiles).toHaveBeenCalledWith([jpg])
  })

  test('single mode hands over one file even from a multi-drop', () => {
    const onFiles = vi.fn()
    const { container } = render(<Upload onFiles={onFiles} />)
    const a = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const b = new File(['x'], 'b.jpg', { type: 'image/jpeg' })
    fireEvent.drop(container.querySelector('label') as HTMLElement, {
      dataTransfer: { files: [a, b] },
    })
    expect(onFiles).toHaveBeenCalledWith([a])
  })
})

describe('Attachment states carry their hallmarks', () => {
  test('uploading renders a REAL progressbar with its value', () => {
    render(<Attachment filename="chain.jpg" state="uploading" progress={62} />)
    const bar = screen.getByRole('progressbar', { name: /uploading chain\.jpg/i })
    expect(bar.getAttribute('aria-valuenow')).toBe('62')
  })

  test('complete has no progressbar - the rail is uploading-only, per the drawing', () => {
    render(<Attachment filename="chain.jpg" state="complete" meta="2.4 MB" />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  test('the remove button names its file', () => {
    const onRemove = vi.fn()
    render(<Attachment filename="chain.jpg" onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: /remove chain\.jpg/i }))
    expect(onRemove).toHaveBeenCalled()
  })

  test('error turns the border destructive and the meta carries the reason', () => {
    const { container } = render(<Attachment filename="chain.jpg" state="error" meta="Too large" />)
    expect((container.firstChild as HTMLElement).className).toContain('border-destructive')
    expect(screen.getByText('Too large').className).toContain('text-destructive')
  })
})
