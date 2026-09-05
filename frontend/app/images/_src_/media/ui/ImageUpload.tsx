'use client'

// The app's face of @dorado/components' Upload + Attachment pair (the process
// rule: a package component replaces its app counterpart in the same pass).
// What this file still owns is the app's business: the upload MUTATION, the
// preview object-URL, and which formats the storage accepts. The dropzone
// mechanics, the file-row anatomy and every state's look are the library's.
//
// What left with the rewrite: framer-motion (the banners are an Attachment
// row's states now), the phosphor icons, the hand-rolled drag handlers and
// the role="button" div - the library's dropzone is a real <input type="file">
// in its <label>.
import Image from 'next/image'
import { useState } from 'react'
import { Attachment, Upload } from '@dorado/components'
import { useUploadImage } from '../queries'

export function ImageUpload({ path }: { path: string }) {
  const uploadMutation = useUploadImage()
  const [file, setFile] = useState<{ name: string; size: number; url: string } | null>(null)

  const onFiles = (files: File[]) => {
    const f = files[0]
    if (!f) return
    if (file) URL.revokeObjectURL(file.url)
    setFile({ name: f.name, size: f.size, url: URL.createObjectURL(f) })
    uploadMutation.mutate({ path, file: f })
  }

  const state = uploadMutation.isPending
    ? ('uploading' as const)
    : uploadMutation.isError
    ? ('error' as const)
    : ('complete' as const)

  const meta = uploadMutation.isPending
    ? 'Uploading…'
    : uploadMutation.isError
    ? 'Upload failed — remove and try again.'
    : file
    ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
    : undefined

  return (
    <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="space-y-2">
        <h3>Image Upload</h3>
        <p>Supported formats: JPG, PNG</p>
      </div>

      <Upload
        onFiles={onFiles}
        accept="image/*"
        disabled={uploadMutation.isPending}
        prompt="Drag & drop, or browse"
        hint="JPG or PNG"
      />

      {file && (
        <Attachment
          filename={file.name}
          meta={meta}
          state={state}
          thumb={
            <Image
              src={file.url}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 rounded-sm object-cover"
            />
          }
          onRemove={() => {
            URL.revokeObjectURL(file.url)
            setFile(null)
            uploadMutation.reset()
          }}
        />
      )}
    </div>
  )
}
