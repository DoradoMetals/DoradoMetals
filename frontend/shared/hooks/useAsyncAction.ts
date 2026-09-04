'use client'

// A `useMutation`-shaped wrapper (mutate/mutateAsync/isPending/isSuccess/
// isError/error) for an action that is NOT an API call - better-auth's own
// client, which @dorado/client may not depend on (ruling 62: the package
// imports nothing but @dorado/contracts/react/react-query, never "the
// frontend's stores, its auth client or an HTTP library"). Plain React state,
// no react-query import, so this stays legal under `frontend/` while keeping
// the same interface every consumer already destructures.
import { useCallback, useRef, useState } from 'react'

type ActionOptions<TData, TVars> = {
  onSuccess?: (data: TData, vars: TVars) => void
  onError?: (error: Error, vars: TVars) => void
  onSettled?: (vars: TVars) => void
}

type Status = 'idle' | 'pending' | 'success' | 'error'

export function useAsyncAction<TVars = void, TData = unknown>(
  action: (vars: TVars) => Promise<TData>,
  hookOptions: ActionOptions<TData, TVars> = {}
) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<Error | null>(null)
  const actionRef = useRef(action)
  actionRef.current = action
  const hookOptionsRef = useRef(hookOptions)
  hookOptionsRef.current = hookOptions

  const mutateAsync = useCallback(
    async (vars: TVars, callOptions?: ActionOptions<TData, TVars>) => {
      setStatus('pending')
      setError(null)
      try {
        const data = await actionRef.current(vars)
        setStatus('success')
        hookOptionsRef.current.onSuccess?.(data, vars)
        callOptions?.onSuccess?.(data, vars)
        return data
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setStatus('error')
        setError(e)
        hookOptionsRef.current.onError?.(e, vars)
        callOptions?.onError?.(e, vars)
        throw e
      } finally {
        hookOptionsRef.current.onSettled?.(vars)
        callOptions?.onSettled?.(vars)
      }
    },
    []
  )

  const mutate = useCallback(
    (vars: TVars, callOptions?: ActionOptions<TData, TVars>) => {
      mutateAsync(vars, callOptions).catch(() => {})
    },
    [mutateAsync]
  )

  return {
    mutate,
    mutateAsync,
    isPending: status === 'pending',
    isSuccess: status === 'success',
    isError: status === 'error',
    isIdle: status === 'idle',
    status,
    error,
  }
}
