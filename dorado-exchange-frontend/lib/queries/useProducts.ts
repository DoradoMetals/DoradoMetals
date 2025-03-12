import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/utils/axiosInstance";
import { Product } from "@/types";

// Fetch products using TanStack Query
export const useProductsByMetal = (metal_type: string) => {
  return useQuery({
    queryKey: ["products", metal_type], // Cache based on category
    queryFn: async () => {
      return apiRequest<Product[]>("GET", "/products/get_products", undefined, { metal_type });
    },
  });
};
