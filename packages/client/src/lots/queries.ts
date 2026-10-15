'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LotImageAdd, LotImageView, LotView } from '@dorado/contracts'

import { apiRequest } from '../fetch'
import { keys } from '../keys'

export function useLotSearch(q: string, unassigned: boolean, options: { enabled?: boolean } = {}) {
  return useQuery<LotView[]>({
    queryKey: keys.lots.search(q, unassigned),
    enabled: (options.enabled ?? true) && q.trim().length > 0,
    queryFn: () =>
      apiRequest<LotView[]>('GET', '/lots', undefined, {
        q,
        unassigned: unassigned ? 'true' : '',
      }),
  })
}

export function useLotImages(lotId: string, options: { enabled?: boolean } = {}) {
  return useQuery<LotImageView[]>({
    queryKey: keys.lots.images(lotId),
    enabled: (options.enabled ?? true) && lotId.length > 0,
    queryFn: () => apiRequest<LotImageView[]>('GET', `/lots/${lotId}/images`),
  })
}

export function useAddLotImage(lotId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: LotImageAdd) =>
      apiRequest<LotImageView[]>('POST', `/lots/${lotId}/images`, body),
    onSuccess: (images) => client.setQueryData(keys.lots.images(lotId), images),
    onSettled: () => client.invalidateQueries({ queryKey: keys.lots.images(lotId) }),
  })
}

export function useRemoveLotImage(lotId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (imageId: string) =>
      apiRequest<LotImageView[]>('DELETE', `/lots/${lotId}/images/${imageId}`),
    onSuccess: (images) => client.setQueryData(keys.lots.images(lotId), images),
    onSettled: () => client.invalidateQueries({ queryKey: keys.lots.images(lotId) }),
  })
}
