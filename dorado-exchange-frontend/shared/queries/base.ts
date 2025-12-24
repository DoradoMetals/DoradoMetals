import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { apiRequest } from '@/shared/queries/axios'
import { useGetSession } from '@/features/auth/queries'
import { Method } from 'axios'

export function upsertById<T extends { id: string }>(list: T[] | undefined, updated: T): T[] {
  const items = list ?? []
  const index = items.findIndex((i) => i.id === updated.id)

  if (index === -1) {
    return [...items, updated]
  }

  const copy = [...items]
  copy[index] = { ...copy[index], ...updated }
  return copy
}

type User = ReturnType<typeof useGetSession>['user']

type ApiQueryConfig<TData> = {
  key: QueryKey
  method?: Method
  url?: string
  body?: (user: User | null) => any
  params?: (user: User | null) => Record<string, any> | undefined
  request?: (user: User | null) => Promise<TData>
  requireUser?: boolean
  requireAdmin?: boolean
  enabled?: boolean | ((user: User | null) => boolean)
} & Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn' | 'enabled'>

export function useApiQuery<TData>(config: ApiQueryConfig<TData>): UseQueryResult<TData, Error> {
  const { user } = useGetSession()
  const {
    key,
    request,
    method = 'GET',
    url,
    body,
    params,
    requireUser = true,
    requireAdmin = false,
    enabled,
    staleTime = 0,
    ...rest
  } = config

  const resolvedEnabled = typeof enabled === 'function' ? enabled(user) : enabled

  return useQuery<TData, Error>({
    queryKey: key,
    enabled: resolvedEnabled ?? (!requireUser || !!user),
    staleTime,
    queryFn: async () => {
      if (requireUser && !user?.id) {
        throw new Error('User is not authenticated')
      }
      if (requireAdmin && user?.role !== 'admin') {
        throw new Error('User is not an admin')
      }

      if (request) {
        return request(user)
      }

      if (!url) {
        throw new Error('useApiQuery: either `request` or `url` must be provided')
      }

      const data = body ? body(user) : undefined
      const queryParams = params ? params(user) : undefined

      return apiRequest<TData>(method, url, data, queryParams)
    },
    ...rest,
  })
}

type OptimisticContext<TList> = {
  previous?: TList
}

type ApiMutationConfig<TData, TVars, TList> = {
  queryKey?: QueryKey
  method?: Method
  url: string
  body?: (vars: TVars, user: User | null) => any
  requireUser?: boolean
  requireAdmin?: boolean

  optimistic?: boolean
  optimisticUpdater?: (list: TList | undefined, vars: TVars) => TList
  invalidateOnSettled?: boolean
  listAction?: 'create' | 'delete' | 'upsert'
  listInsertPosition?: 'start' | 'end'
  optimisticItemKey?: string
} & Omit<
  UseMutationOptions<TData, Error, TVars, OptimisticContext<TList>>,
  'mutationFn' | 'onMutate' | 'onError' | 'onSettled'
>

export function useApiMutation<TData = unknown, TVars = void, TList = unknown>(
  config: ApiMutationConfig<TData, TVars, TList>
): UseMutationResult<TData, Error, TVars, OptimisticContext<TList>> {
  const { user } = useGetSession()
  const queryClient = useQueryClient()

  const {
    method = 'POST',
    url,
    body,
    requireUser = true,
    requireAdmin = false,
    queryKey,
    optimistic = true,
    optimisticUpdater,
    invalidateOnSettled = true,
    listAction,
    listInsertPosition = 'end',
    optimisticItemKey,
    ...rest
  } = config

  const hasOptimistic = optimistic && !!queryKey

  return useMutation<TData, Error, TVars, OptimisticContext<TList>>({
    async mutationFn(vars: TVars) {
      if (requireUser && !user?.id) {
        throw new Error('User is not authenticated')
      }
      if (requireAdmin && user?.role !== 'admin') {
        throw new Error('User is not an admin')
      }

      const payload = body ? body(vars, user) : vars
      return apiRequest<TData>(method, url, payload)
    },

    async onMutate(vars) {
      if (!hasOptimistic || !queryKey) return {}

      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<TList>(queryKey)
      let next: TList = previous as TList

      const itemForList: any =
        optimisticItemKey != null ? (vars as any)[optimisticItemKey] : (vars as any)

      if (optimisticUpdater) {
        next = optimisticUpdater(previous, vars)
      } else if (listAction && Array.isArray(previous)) {
        const baseList = previous as unknown as any[]

        switch (listAction) {
          case 'create': {
            const item = itemForList
            next =
              listInsertPosition === 'start'
                ? ([item, ...baseList] as unknown as TList)
                : ([...baseList, item] as unknown as TList)
            break
          }
          case 'delete': {
            const idToRemove = itemForList?.id ?? (vars as any)?.id ?? (vars as any)
            next = baseList.filter((i: any) => i.id !== idToRemove) as unknown as TList
            break
          }
          case 'upsert': {
            next = upsertById(
              previous as unknown as { id: string }[] | undefined,
              itemForList as { id: string }
            ) as unknown as TList
            break
          }
        }
      } else {
        next = upsertById(
          previous as unknown as { id: string }[] | undefined,
          itemForList as { id: string }
        ) as unknown as TList
      }

      queryClient.setQueryData<TList>(queryKey, next)
      return { previous }
    },

    onError(_err, _vars, ctx) {
      if (hasOptimistic && queryKey && ctx?.previous !== undefined) {
        queryClient.setQueryData<TList | undefined>(queryKey, ctx.previous)
      }
    },

    onSettled(_data, _error, _vars, _ctx) {
      if (queryKey && invalidateOnSettled) {
        queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
      }
    },

    ...rest,
  })
}
