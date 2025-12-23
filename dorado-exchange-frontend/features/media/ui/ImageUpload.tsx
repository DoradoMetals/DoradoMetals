import { Button } from '@/shared/ui/base/button'
import { Input } from '@/shared/ui/base/input'
import { ImagePlus, X } from 'lucide-react'
import Image from 'next/image'
import { useState, useCallback } from 'react'
import { cn } from '@/shared/utils/cn'
import { useUploadImage } from '@/features/media/queries'
import { useImageUpload } from '@/utils/useImageUpload'
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
    <div className="w-full max-w-md space-y-6 rounded-lg raised-off-page bg-card p-6">
      <div className="space-y-2">
        <h3 className="text-lg text-neutral-800">Image Upload</h3>
        <p className="text-xs text-neutral-500">Supported formats: JPG, PNG</p>
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
          onClick={handleThumbnailClick}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex h-64 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg recessed-into-page bg-background transition-colors hover:bg-neutral-100',
            isDragging && 'border-primary/50 bg-primary/10'
          )}
        >
          <div className="rounded-full bg-card p-3 raised-off-page">
            <ImagePlus className="h-6 w-6 text-neutral-700" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-800">Click to select</p>
            <p className="text-xs text-neutral-600">or drag and drop file here</p>
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
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 hover:backdrop-blur-[2px]">
              <Button
                variant="ghost"
                onClick={handleThumbnailClick}
                className="raised-off-page bg-card/50 hover:bg-card rounded-lg py-2"
              >
                <UploadIcon size={32} className="text-neutral-900" />
              </Button>
              <Button
                variant="ghost"
                onClick={handleRemove}
                className="raised-off-page bg-card/50 hover:bg-card rounded-lg py-2"
              >
                <TrashIcon size={32} className="text-destructive" />
              </Button>
            </div>
          </div>
          {fileName && (
            <div className="mt-2 flex items-center gap-2 text-sm text-neutral-600">
              <span className="truncate">{fileName}</span>
              <Button
                variant={'ghost'}
                onClick={handleRemove}
                className="ml-auto rounded-full p-1 text-neutral-700 hover:text-neutral-900"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {uploadMutation.isPending && <p className="text-sm text-neutral-600">Uploading…</p>}
      {uploadMutation.isError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 rounded-xl text-sm px-4 py-2 bg-destructive/15 border-2 border-destructive will-change-transform shadow-sm"
        >
          <XCircleIcon size={24} className="text-destructive" />
          <p className="text-sm sm:text-base text-destructive">Upload failed.</p>
        </motion.div>
      )}
      {uploadMutation.isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 rounded-xl text-sm px-4 py-2 bg-success/15 border-2 border-success will-change-transform shadow-sm"
        >
          <CheckCircleIcon size={24} className="text-success" />
          <p className="text-sm sm:text-base text-success">Image Uploaded!</p>
        </motion.div>
      )}
    </div>
  )
}
