import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import * as React from 'react'

import { PhotoViewer } from './PhotoViewer'
import { Thumbnail } from '../thumbnail/Thumbnail'
import { expectNoAxeViolations } from '../test/axe'

const photos = [{ src: '/a.jpg' }, { src: '/b.jpg', alt: 'Back of the coin' }, { src: '/c.jpg' }]

describe('PhotoViewer accessibility', () => {
  it('every photo has alt text, falling back to its position', async () => {
    const { getByRole, container } = render(
      <PhotoViewer title="Coin" photos={photos} index={0} onIndexChange={() => {}} />
    )
    expect(getByRole('img', { name: 'Photo 1 of 3' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('arrow keys page the photos and Escape closes', () => {
    const onIndexChange = vi.fn()
    const onClose = vi.fn()
    const { getByRole } = render(
      <PhotoViewer
        title="Coin"
        photos={photos}
        index={1}
        onIndexChange={onIndexChange}
        onClose={onClose}
      />
    )
    const viewer = getByRole('group', { name: 'Photo viewer' })
    fireEvent.keyDown(viewer, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(viewer, { key: 'ArrowLeft' })
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(viewer, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the count is a polite live region', () => {
    const { getByText } = render(
      <PhotoViewer title="Coin" photos={photos} index={0} onIndexChange={() => {}} count="1 of 3" />
    )
    expect(getByText('1 of 3').getAttribute('aria-live')).toBe('polite')
  })
})

describe('Thumbnail accessibility', () => {
  it('a thumbnail with no alt and no image still has a name', async () => {
    const { getByRole, container } = render(
      <>
        <Thumbnail />
        <Thumbnail src="/a.jpg" />
        <Thumbnail src="/b.jpg" alt="Front" />
      </>
    )
    expect(getByRole('button', { name: 'Front' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })
})
