import { apiRequest } from '@/utils/axiosInstance'
import { useMutation } from '@tanstack/react-query'

export function useVerifyRecaptcha() {
  return useMutation({
    mutationFn: async (token: string) => {
      return await apiRequest('POST', 'recaptcha/verify-recaptcha', { token })
    },
  })
}