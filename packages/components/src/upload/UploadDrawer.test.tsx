import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import * as React from 'react'

import { UploadDrawer } from './UploadDrawer'
import { expectNoAxeViolations } from '../test/axe'

describe('Upload Drawer (1138:193)', () => {
  it('is the Drawer at SM, titled "Upload files", with the Upload card and Cancel / Upload', () => {
    const setOpen = vi.fn()
    const onUpload = vi.fn()
    const { getByRole } = render(
      <UploadDrawer open setOpen={setOpen} onFiles={() => {}} onUpload={onUpload} canUpload />
    )
    const dialog = getByRole('dialog', { name: 'Upload files' })
    expect(dialog.className).toContain('sm:w-(--drawer-sm)')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }))
    expect(onUpload).toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(setOpen).toHaveBeenCalledWith(false)
  })

  it('Upload is disabled until there is something to upload', () => {
    const { getByRole } = render(
      <UploadDrawer open setOpen={() => {}} onFiles={() => {}} onUpload={() => {}} />
    )
    expect((getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the open drawer passes axe', async () => {
    render(
      <UploadDrawer open setOpen={() => {}} onFiles={() => {}} onUpload={() => {}} canUpload />
    )
    await expectNoAxeViolations(document.body)
  })
})
