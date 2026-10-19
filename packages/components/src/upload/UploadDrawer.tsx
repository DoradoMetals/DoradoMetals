'use client'

import * as React from 'react'

import { Button } from '../button/Button'
import { Drawer, DrawerBody, DrawerFooter, DrawerHeader } from '../drawer/Drawer'
import { Upload, type UploadProps } from './Upload'

export type UploadDrawerProps = UploadProps & {
  open: boolean
  setOpen: (open: boolean) => void
  title?: string
  onUpload: () => void
  canUpload?: boolean
}

// Upload Drawer 1138:193: the Library Drawer at Size=SM with the Upload card
// in its body and Cancel / Upload in the footer. Opens from an attach action.
export function UploadDrawer({
  open,
  setOpen,
  title = 'Upload files',
  onUpload,
  canUpload = false,
  ...upload
}: UploadDrawerProps) {
  return (
    <Drawer open={open} setOpen={setOpen} size="sm" label={title}>
      <DrawerHeader title={title} />
      <DrawerBody>
        <Upload {...upload} />
      </DrawerBody>
      <DrawerFooter>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button onClick={onUpload} disabled={!canUpload}>
          Upload
        </Button>
      </DrawerFooter>
    </Drawer>
  )
}
