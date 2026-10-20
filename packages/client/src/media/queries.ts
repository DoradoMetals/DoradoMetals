'use client'

import { useMutation, useQuery } from '@tanstack/react-query'

import { ApiError, apiRequest } from '../fetch'
import { keys } from '../keys'

type ImageUpload = { id: string; uploadUrl: string }

export async function uploadImage(file: File): Promise<string> {
  const registered = await apiRequest<ImageUpload>('POST', '/images', {
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  })
  const put = await fetch(registered.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!put.ok) throw new ApiError(put.status, `the image upload failed with ${put.status}`, null)
  return registered.id
}

export function useUploadImage() {
  return useMutation({ mutationFn: uploadImage })
}

export function useImageUrl(imageId: string, options: { enabled?: boolean } = {}) {
  return useQuery<string>({
    queryKey: keys.media.url(imageId),
    enabled: (options.enabled ?? true) && imageId.length > 0,
    queryFn: () => apiRequest<string>('GET', `/images/${imageId}/url`),
  })
}
