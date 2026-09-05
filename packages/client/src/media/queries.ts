'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Image as ImageContract } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export type Image = ImageContract & { url: string }

export type ImageUpload = { path?: string; file: File }
export type ImageUploadReturn = { id: string; uploadUrl: string }

export function useImages() {
  return useQuery<Image[]>({
    queryKey: keys.media.images.all(),
    queryFn: () => apiRequest<Image[]>('GET', '/images'),
  })
}

export function useUploadImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file }: ImageUpload): Promise<{ id: string }> => {
      const { id, uploadUrl } = await apiRequest<ImageUploadReturn>('POST', '/images', {
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      return { id }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.media.images.all() })
    },
  })
}

export function useDeleteImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>('DELETE', `/images/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: keys.media.images.all() })
      const previous = queryClient.getQueryData<Image[]>(keys.media.images.all())
      queryClient.setQueryData<Image[]>(keys.media.images.all(), (list) =>
        list?.filter((img) => img.id !== id)
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(keys.media.images.all(), context.previous)
    },
  })
}
