export interface Image {
  id: string
  user_id: string
  bucket: string
  path: string
  filename: string,
  mime_type: string | null
  size_bytes: number | null
  width: number
  height: number
  metadata: string
  created_at: string
  url: string
}

export interface ImageUpload {
  path: string
  file: File
}

export interface ImageUploadReturn {
  id: string
  uploadUrl: string
}
