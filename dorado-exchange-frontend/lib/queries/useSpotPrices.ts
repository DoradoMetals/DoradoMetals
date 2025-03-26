// hooks/useSpotPrices.ts
import { useQuery } from "@tanstack/react-query"
import { apiRequest } from "@/utils/axiosInstance"

export type SpotPrice = {
  id: string
  type: string
  ask_spot: number
  bid_spot: number
  percent_change: number,
  dollar_change: number,
}

export const useSpotPrices = () => {
  return useQuery<SpotPrice[]>({
    queryKey: ["spot_prices"],
    queryFn: async () => {
      return await apiRequest<SpotPrice[]>("GET", "/spots/spot_prices")
    },
    refetchInterval: 10000,
  })
}