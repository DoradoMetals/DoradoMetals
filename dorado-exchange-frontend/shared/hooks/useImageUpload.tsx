import { useCallback, useEffect, useRef, useState } from "react"

type UseImageUploadProps = {
  onSelect?: (file: File) => void
}

export function useImageUpload({ onSelect }: UseImageUploadProps = {}) {
  const previewRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const handleThumbnailClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const f = event.target.files?.[0]
      if (!f) return

      setFile(f)
      setFileName(f.name)

      const url = URL.createObjectURL(f)
      setPreviewUrl(url)
      previewRef.current = url

      onSelect?.(f)
    },
    [onSelect],
  )

  const handleFile = useCallback(
  (file: File) => {
    setFileName(file.name)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    previewRef.current = url
    onSelect?.(file)
  },
  [onSelect],
)

  const handleRemove = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    setPreviewUrl(null)
    setFileName(null)
    setFile(null)
    previewRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [])

  return {
    file,
    previewUrl,
    fileName,
    fileInputRef,
    handleThumbnailClick,
    handleFileChange,
    handleFile,
    handleRemove,
  }
}
