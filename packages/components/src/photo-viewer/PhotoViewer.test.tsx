import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { PhotoViewer } from './PhotoViewer'
import { expectNoAxeViolations } from '../test/axe'

const photos = [{ alt: 'one' }, { alt: 'two' }, { alt: 'three' }]

describe('PhotoViewer', () => {
  it('wears the dialog chassis tokens and shows title, count and meta', async () => {
    const { getByRole, getByText, container } = render(
      <PhotoViewer
        title="Photos"
        photos={photos}
        index={1}
        onIndexChange={() => {}}
        count="2 of 3"
        meta="IMG.jpg"
      />
    )
    const root = getByRole('group')
    expect(root.className).toContain('bg-highest')
    expect(root.className).toContain('p-md')
    expect(root.className).toContain('gap-md')
    expect(getByText('2 of 3')).toBeTruthy()
    expect(getByText('IMG.jpg').className).toContain('text-subtle')
    await expectNoAxeViolations(container)
  })

  it('arrows step and disable at the ends; thumbnails select', () => {
    const onIndexChange = vi.fn()
    const { getByRole } = render(
      <PhotoViewer title="P" photos={photos} index={0} onIndexChange={onIndexChange} />
    )
    expect((getByRole('button', { name: 'Previous photo' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    fireEvent.click(getByRole('button', { name: 'Next photo' }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
    fireEvent.click(getByRole('button', { name: 'three' }))
    expect(onIndexChange).toHaveBeenCalledWith(2)
    expect(getByRole('button', { name: 'one' }).getAttribute('aria-current')).toBe('true')
  })

  it('close, download and delete exist only with handlers', () => {
    const onClose = vi.fn()
    const { getByRole, queryByRole, rerender } = render(
      <PhotoViewer
        title="P"
        photos={photos}
        index={0}
        onIndexChange={() => {}}
        onClose={onClose}
        onDelete={() => {}}
      />
    )
    fireEvent.click(getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(getByRole('button', { name: /Delete/ }).className).toContain('text-destructive')
    expect(queryByRole('button', { name: /Download/ })).toBeNull()
    rerender(<PhotoViewer title="P" photos={photos} index={0} onIndexChange={() => {}} />)
    expect(queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('mobile stacks the footer', () => {
    const { getByText } = render(
      <PhotoViewer
        title="P"
        photos={photos}
        index={0}
        onIndexChange={() => {}}
        layout="mobile"
        meta="m"
      />
    )
    expect(getByText('m').parentElement!.className).toContain('flex-col')
  })
})
