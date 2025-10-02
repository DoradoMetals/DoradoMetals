import { useQuery } from "@tanstack/react-query"
import { useGetSession } from "./useAuth"
import { apiRequest } from "@/utils/axiosInstance"
import { PayoutBracket } from "@/types/payout-brackets"

export const usePayoutBrackets = () => {
  const { user } = useGetSession()

  return useQuery<PayoutBracket[]>({
    queryKey: ['payout_brackets', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      return await apiRequest<PayoutBracket[]>('GET', '/payout_brackets/get_payout_brackets', undefined, {
        user_id: user.id,
      })
    },
    enabled: !!user,
  })
}
