// lib/queries/useImages.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { useGetSession } from './useAuth'
import type { Image, ImageUpload, ImageUploadReturn} from '@/types/image'

export const useTestImage = () =>
  useQuery<Image[]>({
    queryKey: ['test_image'],
    queryFn: async () => {
      return await apiRequest<Image[]>('GET', '/images/get_test_image', undefined, {})
    },
  })

export const useImage = (id: string) =>
  useQuery<string>({
    queryKey: ['images', id],
    queryFn: async () => {
      return await apiRequest<string>('GET', '/images/get_url', undefined, { image_id: id })
    },
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
      queryClient.invalidateQueries({ queryKey: ['images'], refetchType: 'active' })
    },
  })
}

export const useDeleteImage = () => {
  const { user } = useGetSession()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('DELETE', '/images/delete', { user_id: user.id, id })
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['images'], refetchType: 'active' })
    },
  })
}
