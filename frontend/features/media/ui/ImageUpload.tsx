import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { ImagePlus, X } from 'lucide-react'
import Image from 'next/image'
import { useState, useCallback } from 'react'
import { cn } from '@/shared/utils/cn'
import { useUploadImage } from '@/features/media/queries'
import { useImageUpload } from '@/shared/hooks/useImageUpload'
import { CheckCircleIcon, TrashIcon, UploadIcon, XCircleIcon } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

export function ImageUpload({ path }: { path: string }) {
  const uploadMutation = useUploadImage()

  const {
    previewUrl,
    fileName,
    fileInputRef,
    handleThumbnailClick,
    handleFileChange,
    handleFile,
    handleRemove,
  } = useImageUpload({
    onSelect: (f) => {
      uploadMutation.mutate({ path: path, file: f })
    },
  })

  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const f = e.dataTransfer.files?.[0]
      if (f && f.type.startsWith('image/')) handleFile(f)
    },
    [handleFile]
  )

  return (
    <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-6">
      <div className="space-y-2">
        <h3>Image Upload</h3>
        <p>Supported formats: JPG, PNG</p>
      </div>

      <Input
        type="file"
        accept="image/*"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {!previewUrl ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Select an image to upload"
          onClick={handleThumbnailClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleThumbnailClick()
            }
          }}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            // ⚠ D99: the hover was `bg-background` -> `bg-muted`, a 1.22:1 step on the
            // one affordance whose whole job is to say "you can drop here". The
            // border moves with it now, which is the visible half.
            'flex h-64 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-background transition-colors hover:bg-muted hover:border-border-strong',
            isDragging && 'border-primary bg-primary/10'
          )}
        >
          <div className="rounded-full bg-card p-3 border border-border">
            <ImagePlus className="h-6 w-6" />
          </div>
          <div className="text-center">
            <p>
              <strong>Click to select</strong>
            </p>
            <p>or drag and drop file here</p>
          </div>
        </div>
      ) : (
        <div className="relative">
          <div className="group relative h-64 overflow-hidden rounded-lg border">
            <Image
              src={previewUrl}
              alt="Preview"
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-neutral-300/50 opacity-0 transition-opacity group-hover:opacity-100 " />
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="secondary"
                size="icon"
                aria-label="Replace image"
                onClick={handleThumbnailClick}
              >
                <UploadIcon size={32} />
              </Button>
              <Button
                variant="secondary"
                intent="danger"
                size="icon"
                aria-label="Remove image"
                onClick={handleRemove}
              >
                <TrashIcon size={32} />
              </Button>
            </div>
          </div>
          {fileName && (
            <div className="mt-2 flex items-center gap-2">
              <small className="truncate">{fileName}</small>
              <Button
                variant="tertiary"
                size="iconXs"
                aria-label="Remove image"
                onClick={handleRemove}
                className="ml-auto"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {uploadMutation.isPending && <p>Uploading…</p>}
      {uploadMutation.isError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 rounded-lg px-4 py-2 bg-destructive/15 border border-destructive will-change-transform"
        >
          <XCircleIcon size={24} className="text-destructive" />
          <p className="text-destructive">Upload failed.</p>
        </motion.div>
      )}
      {uploadMutation.isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 rounded-lg px-4 py-2 bg-success/15 border border-success will-change-transform"
        >
          <CheckCircleIcon size={24} className="text-success" />
          <p className="text-success">Image Uploaded!</p>
        </motion.div>
      )}
    </div>
  )
}
