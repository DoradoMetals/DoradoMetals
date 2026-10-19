import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'

import { PhotoViewer, type PhotoViewerPhoto, type PhotoViewerProps } from './PhotoViewer'
import { classList, setup } from '../test/render'
import { expectNoAxeViolations } from '../test/axe'

const photos: PhotoViewerPhoto[] = [
  { src: 'data:,a', alt: 'Front' },
  { src: 'data:,b' },
  { alt: 'Missing image' },
]

function Harness(props: Partial<PhotoViewerProps>) {
  const [index, setIndex] = React.useState(0)
  return (
    <PhotoViewer
      title="Lot photos"
      photos={photos}
      index={index}
      onIndexChange={setIndex}
      count={`${index + 1} of ${photos.length}`}
      {...props}
    />
  )
}

describe('PhotoViewer state matrix', () => {
  it.each([
    ['desktop', {}],
    ['mobile', { layout: 'mobile' as const }],
    [
      'with actions and meta',
      { onDownload: () => {}, onDelete: () => {}, onClose: () => {}, meta: 'Taken Oct 1' },
    ],
    [
      'mobile with actions',
      { layout: 'mobile' as const, onDownload: () => {}, meta: 'Taken Oct 1' },
    ],
    ['no photos', { photos: [] }],
    ['one photo', { photos: [photos[0]!] }],
  ])('%s renders and axe finds nothing', async (_name, props) => {
    const { container, getByRole } = setup(<Harness {...props} />)
    expect(getByRole('group', { name: 'Photo viewer' })).toBeTruthy()
    await expectNoAxeViolations(container)
  })

  it('the default viewer keeps its class list', () => {
    const { getByRole } = setup(<Harness />)
    expect(classList(getByRole('group'))).toMatchInlineSnapshot(`
      [
        "bg-highest",
        "border",
        "border-border",
        "flex",
        "flex-col",
        "gap-md",
        "max-w-[60rem]",
        "p-md",
        "rounded-lg",
        "w-full",
      ]
    `)
  })
})

describe('PhotoViewer behaviour', () => {
  it('controlled: the index prop wins and each control reports the next index', async () => {
    const onIndexChange = vi.fn()
    const { user, getByRole } = setup(
      <PhotoViewer title="Lot" photos={photos} index={1} onIndexChange={onIndexChange} />
    )
    await user.click(getByRole('button', { name: 'Next photo' }))
    expect(onIndexChange).toHaveBeenLastCalledWith(2)
    await user.click(getByRole('button', { name: 'Previous photo' }))
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
    await user.click(getByRole('button', { name: 'Missing image' }))
    expect(onIndexChange).toHaveBeenLastCalledWith(2)
    expect(getByRole('img', { name: 'Photo 2 of 3' })).toBeTruthy()
  })

  it('arrows page and stop at the ends; Escape closes', async () => {
    const onClose = vi.fn()
    const { user, getByRole, getByText } = setup(<Harness onClose={onClose} />)
    getByRole('button', { name: 'Front' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(getByText('1 of 3')).toBeTruthy()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(getByText('3 of 3')).toBeTruthy()
    await user.keyboard('{ArrowLeft}')
    expect(getByText('2 of 3')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape without onClose does nothing', async () => {
    const { user, getByRole, getByText } = setup(<Harness />)
    getByRole('button', { name: 'Front' }).focus()
    await user.keyboard('{Escape}')
    expect(getByText('1 of 3')).toBeTruthy()
  })

  it('a photo with no source shows the placeholder icon', () => {
    const { container } = setup(
      <PhotoViewer title="Lot" photos={photos} index={2} onIndexChange={() => {}} />
    )
    expect(container.querySelector('.size-lg')).toBeTruthy()
  })

  it('an index past the end shows the placeholder and both arrows behave', () => {
    const { getByRole, container } = setup(
      <PhotoViewer title="Lot" photos={photos} index={5} onIndexChange={() => {}} />
    )
    expect(container.querySelector('.size-lg')).toBeTruthy()
    expect(getByRole('button', { name: 'Next photo' })).toHaveProperty('disabled', true)
  })

  it('download and delete fire from the keyboard', async () => {
    const onDownload = vi.fn()
    const onDelete = vi.fn()
    const { user, getByRole } = setup(<Harness onDownload={onDownload} onDelete={onDelete} />)
    getByRole('button', { name: 'Download' }).focus()
    await user.keyboard('{Enter}')
    await user.tab()
    await user.keyboard(' ')
    expect(onDownload).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
