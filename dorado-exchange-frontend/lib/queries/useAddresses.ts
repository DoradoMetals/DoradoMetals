import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/axiosInstance";
import { Address } from "@/types/address";
import { UUID } from "crypto";

export const useAddress = (user_id: UUID) => {
  return useQuery<Address[] | null>({
    queryKey: ["address", user_id], // Singular key to reflect single address
    queryFn: async () => {
      if (!user_id) return null;
      const data = await apiRequest<Address[]>("GET", "/users/get_addresses", undefined, { user_id });

      // Ensure we return only a single object
      return data || null;
    },
    enabled: !!user_id,
  });
};

export const useUpdateAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("POST", "/users/create_and_update_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address", user_id] });
    },
  });
};

export const useDeleteAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("DELETE", "/users/delete_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address", user_id] });
    },
  });
};