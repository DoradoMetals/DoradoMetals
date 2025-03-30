import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/utils/axiosInstance";
import { Product } from "@/types";

interface ProductFilters {
  metal_type?: string;
  mint_type?: string;
  product_type?: string;
}

export const useFilteredProducts = (filters: ProductFilters) => {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: async () => {
      return apiRequest<Product[]>("GET", "/products/get_products", undefined, filters);
    },
    enabled: !!filters,
  });
};

interface FiltersResponse {
  metals: string[];
  types: string[];
  mints: string[];
}

export const useProductFilters = () => {
  return useQuery<FiltersResponse>({
    queryKey: ["filters"],
    queryFn: async () => {
      return apiRequest<FiltersResponse>("GET", "/products/get_product_filters");
    },
  });
};
