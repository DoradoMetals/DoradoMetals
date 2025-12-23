'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import type { Image, ImageUpload, ImageUploadReturn } from '@/features/media/types'
import { useApiMutation, useApiQuery } from '@/shared/queries/base'
import { queryKeys } from '@/shared/queries/keyFactory'
import { useGetSession } from '@/features/auth/queries'


export const useTestImage = () =>
  useApiQuery<Image[]>({
    key: queryKeys.testImage(),
    url: '/images/get_test_image',
  })

export const useImage = (id: string) =>
  useApiQuery<string>({
    key: queryKeys.image(id),
    url: '/images/get_url',
    enabled: !!id,
    params: () => ({
      image_id: id,
    }),
  })

export const useUploadImage = () => {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: ['image-upload'],
    mutationFn: async (image: ImageUpload) => {
      const { id, uploadUrl } = await apiRequest<ImageUploadReturn>('POST', '/images/upload', {
        path: image.path,
        filename: image.file.name,
        mimeType: image.file.type,
        size: image.file.size,
        user_id: user?.id,
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
    body: (id, user) => ({
      user_id: user!.id,
      id,
    }),
  })
