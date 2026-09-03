'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import type { Image, ImageUpload, ImageUploadReturn } from '@/features/media/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keys'


export const useTestImage = () =>
  useApiQuery<Image[]>({
    key: queryKeys.testImage(),
    url: '/images/get_test_image',
  })

export const useUploadImage = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['image-upload'],
    mutationFn: async (image: ImageUpload) => {
      // path/user_id are server-controlled now (the object key is chosen
      // server-side, the owner comes from the session) - naming either is a
      // 400. mimeType/size are renamed to the column names mime_type/size_bytes.
      const { id, uploadUrl } = await apiRequest<ImageUploadReturn>('POST', '/images/upload', {
        filename: image.file.name,
        mime_type: image.file.type,
        size_bytes: image.file.size,
      })

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': image.file.type },
        body: image.file,
      })

      return { id }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.images(),
        refetchType: 'active',
      })
    },
  })
}

export const useDeleteImage = () =>
  useApiMutation<void, string, Image[]>({
    queryKey: queryKeys.images(),
    method: 'DELETE',
    url: '/images/delete',
    listAction: 'delete',
    // user_id is the session's now, not the body's - naming it is a 400.
    body: (id) => ({
      id,
    }),
  })
