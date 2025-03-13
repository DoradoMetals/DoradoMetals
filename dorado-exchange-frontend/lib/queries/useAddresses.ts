import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/utils/axiosInstance";
import { Address } from "@/types/address";
import { UUID } from "crypto";

export const useAddress = (user_id: UUID) => {
  return useQuery<Address[] | null>({
    queryKey: ["address", user_id],
    queryFn: async () => {
      if (!user_id) return null;
      const data = await apiRequest<Address[]>("GET", "/addresses/get_addresses", undefined, { user_id });
      return data || null;
    },
    enabled: !!user_id,
  });
};

export const useUpdateAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("POST", "/addresses/create_and_update_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address", user_id]});
      queryClient.refetchQueries({queryKey: ["address", user_id]});
    },
  });
};

export const useDeleteAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("DELETE", "/addresses/delete_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address", user_id]});
      queryClient.refetchQueries({queryKey: ["address", user_id]});
    },
  });
};

export const useSetDefaultAddress = (user_id: UUID) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (address: Address) => {
      return await apiRequest("POST", "/addresses/set_default_address", {
        user_id,
        address,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["address", user_id]});
      queryClient.refetchQueries({queryKey: ["address", user_id]});
    },
  });
}